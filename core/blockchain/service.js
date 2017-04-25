/**
 * Part of the evias/pacNEM package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/pacNEM
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @contributor Nicolas Dubien (https://github.com/dubzzz)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 */

(function() {

var config = require("config");

/**
 * class service provide a business layer for
 * blockchain data queries used in the pacNEM game.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var service = function(io, nemSDK)
{
    var socket_ = io;

    // initialize the current running game's blockchain service with
    // the NEM blockchain. This will create the endpoint for the given
    // network and port (testnet, mainnet, mijin) and will then initialize
    // a common object using the configured private key.
    var nem_    = nemSDK;

    var isTestMode   = config.get("nem.isTestMode");

    var envSuffix  = isTestMode ? "_TEST" : "";
    var confSuffix = isTestMode ? "_test" : "";

    // connect to the blockchain with the NEM SDK
    var nemHost = process.env["NEM_HOST" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].host;
    var nemPort = process.env["NEM_PORT" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].port;
    var node_   = nem_.model.objects.create("endpoint")(nemHost, nemPort);

    // following XEM Accounts are used for all blockchain requests.
    // - vendor_ : The Vendor Wallet is the Multi Signature account containing all Mosaics!
    // - pacNEM_ : The Cosignatory Wallet is one of the 2 cosignatories of vendor_ (the public one, not the sign-bot..).
    var vendor_  = (process.env["APP_VENDOR"] || config.get("pacnem.business")).replace(/-/g, "");
    var pacNEM_  = (process.env["APP_PUBLIC"] || config.get("pacnem.application") || config.get("pacnem.business")).replace(/-/g, "");

    // Configure the mosaics namespace to be used
    var pacNEM_NS_ = (process.env["APP_NAMESPACE"] || config.get("pacnem.namespace"));

    /**
     * Get the NEM Namespace used for this application.
     *
     * @return string   The namespace + subnamespace(s) joined with a dot (.).
     */
    this.getNamespace = function()
    {
        return pacNEM_NS_;
    };

    /**
     * Get the Multi Signature Vendor wallet for this application.
     *
     * Must not be multisig, could be simple wallet.
     *
     * @return string   The namespace + subnamespace(s) joined with a dot (.).
     */
    this.getVendorWallet = function()
    {
        return vendor_;
    };

    /**
     * Get the Cosignatory Wallet for this application.
     * This wallet's address is published in the source code.
     *
     * In case the vendor wallet is not a multi signature account,
     * the vendor and cosignatory wallet will be the same.
     *
     * @return {[type]} [description]
     */
    this.getPublicWallet = function()
    {
        return pacNEM_;
    };

    /**
     * Get the Network details. This will return the currently
     * used config for the NEM node (endpoint).
     *
     * @return Object
     */
    this.getNetwork = function()
    {
        var isTest  = config.get("nem.isTestMode");
        var isMijin = config.get("nem.isMijin");

        return {
            "host": node_.host,
            "port": node_.port,
            "label": isTest ? "Testnet" : isMijin ? "Mijin" : "Mainnet",
            "config": isTest ? nem_.model.network.data.testnet : isMijin ? nem_.model.network.data.mijin : nem_.model.network.data.mainnet,
            "isTest": isTest,
            "isMijin": isMijin
        };
    };

    /**
     * Get the status of the currently select NEM blockchain node.
     *
     * @return Promise
     */
    this.heartbeat = function()
    {
        return nem_.com.requests.endpoint.heartbeat(node_);
    };

    /**
     * This method fetches mosaics for the given XEM address.
     *
     * If the mosaic evias.pacnem:heart can be found in the account, a call
     * to `fetchGameCreditsRealHistoryByGamer` will be issued in order
     * to fetch `allTransactions` of the account.
     *
     * We will fetch all transactions only for accounts which we know they
     * own evias.pacnem:heart Mosaics.
     *
     * @param  NEMGamer gamer
     */
    this.fetchHeartsByGamer = function(gamer)
    {
        var self = this;
        var heartsMosaicSlug = pacNEM_NS_ + ":heart";

        // read Mosaics owned by the given address's XEM wallet
        nem_.com.requests.account.mosaics(node_, gamer.getAddress()).then(function(res)
        {
            if (! res.data || ! res.data.length) {
                gamer.updateCredits({countHearts: 0});
                return null;
            }

            // this accounts owns mosaics, check if he has evias.pacnem:heart
            // mosaic so that he can play.
            var hasHearts = false;
            for (var i in res.data) {
                var mosaic = res.data[i];
                var slug   = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;
                if (heartsMosaicSlug == slug) {
                    // this account has some lives available as SAYS THE BLOCKCHAIN.
                    // we can store this information in our NEMGameCredit model.

                    // be aware that the Mosaics BALANCE does not represent the number
                    // of Available Lives! The user may have *Played* Hearts or *Sent Back*
                    // Hearts to the pacnem-business wallet.

                    // computing the exact balance of the user (we now know that the user owns hearts.)
                    self.fetchGameCreditsRealHistoryByGamer(gamer, mosaic);
                    hasHearts = true;
                }
            }

            if (! hasHearts)
                gamer.updateCredits({countHearts: 0});
        }, function(err) {
            // NO Mosaics available / wrong Network for address / Unresolved Promise Errors

            gamer.updateCredits({countHearts: 0});
        });
    };

    /**
     * This method fetches allTransactions of a given XEM account
     * and updates the `gamer` object's credits (`updateCredits`)
     * with what can be computed from the Transaction History of the
     * account.
     *
     * Only Transfer Transactions and Multi Signature Transaction are
     * taken into account as those are ones which can change the
     * evias.pacnem:heart balance of given XEM accounts.
     *
     * @param  {NEMGamer} gamer
     * @param  {nem.objects.mosaicAttachment} mosaic
     */
    this.fetchGameCreditsRealHistoryByGamer = function(gamer, mosaic)
    {
        var self = this;
        var heartsMosaicSlug = pacNEM_NS_ + ":heart";

        // read all transactions of the account and check for the given mosaic to build a
        // blockchain-trust mosaic history.
        nem_.com.requests.account.allTransactions(node_, gamer.getAddress()).then(function(res)
        {
            var transactions = res;
            var totalHeartsIncome = 0;
            var totalHeartsOutgo  = 0;

            for (var i in transactions) {
                var content    = transactions[i].transaction;
                var meta       = transactions[i].meta;
                var recipient  = null;

                if (content.type != nem_.model.transactionTypes.transfer
                    && content.type != nem_.model.transactionTypes.multisigTransaction)
                    // we are interested only in transfer transactions
                    // and multisig transactions because only those might
                    // change the evias.pacnem:heart balance of XEM address
                    continue;

                var mosaicStake = self.extractMosaic_(content, heartsMosaicSlug);

                if (mosaicStake === false)
                    continue;

                if (mosaicStake.recipient == gamer.getAddress()) {
                    // gamer's transaction (incoming for gamer)
                    totalHeartsIncome += mosaicStake.totalMosaic;
                }
                else if (mosaicStake.recipient !== false) {
                    // pacnem transaction (outgoing for gamer)
                    totalHeartsOutgo  += mosaicStake.totalMosaic;
                }
            }

            var totalRemaining = totalHeartsIncome > totalHeartsOutgo ? totalHeartsIncome - totalHeartsOutgo : 0;
            gamer.updateCredits({countHearts: totalRemaining, countExchangedHearts: totalHeartsOutgo});
        }, function(err) {
            // NO Transactions available / wrong Network for address / Unresolved Promise Errors

            gamer.updateCredits({countHearts: 0});
        });
    };

    this.extractMosaic_ = function(trxContent, slugToExtract)
    {
        if (! trxContent || ! slugToExtract || ! slugToExtract.length)
            return {totalMosaic: 0, recipient: false};

        if (trxContent.type == nem_.model.transactionTypes.multisigTransaction) {
            // multisig transaction mode
            // here we must check whether `trxContent.otherTrans.mosaics`
            // is set, this will to `res.data[i].transaction.otherTrans.mosaics`
            // from the raw Promise result.

            if (typeof trxContent.otherTrans == 'undefined')
                // MultiSig transactions WITHOUT `otherTrans` CANNOT contain Mosaics.
                return false;

            if (typeof trxContent.otherTrans.mosaics == 'undefined')
                // No Mosaics in this one :()
                return false;

            var trxMosaics = trxContent.otherTrans.mosaics;
            var recipient  = trxContent.otherTrans.recipient;
            var trxAmount  = trxContent.otherTrans.amount;
        }
        else {
            // transfer transaction mode
            // here we can simply read the `trxContent.mosaics`, this translates to
            // `res.data[i].transaction.mosaics` from the raw Promise result.

            if (typeof trxContent.mosaics == 'undefined' || ! trxContent.mosaics.length)
                // we are interested only in Mosaic Transfer transactions
                return false;

            var trxMosaics = trxContent.mosaics;
            var recipient  = trxContent.recipient;
            var trxAmount  = trxContent.amount;
        }

        // now iterate through the found mosaics and check whether
        // this transaction contains evias.pacnem:heart mosaics.
        for (j in trxMosaics) {
            var mosaic = trxMosaics[j];
            var slug   = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

            if (slugToExtract != slug)
                // mosaic filter
                return false;

            // get the quantity, compute with transaction amount field in mosaic transfer
            // transaction, the amount field is in fact a QUANTITY. Whereas the `mosaic.quantity`
            // field represents the AMOUNT of Mosaics in the described Attachment.
            var mosAmount   = parseInt(mosaic.quantity);
            var mosMultiply = trxAmount > 0 ? parseInt(trxAmount / 1000000) : 1; // multiplier field stored in micro XEM in transactions!
            var totalMosaic = mosMultiply * mosAmount;

            // found our mosaic in `trxContent`
            return {totalMosaic: totalMosaic, recipient: recipient};
        }

        // didn't find our mosaic in `trxContent`
        return {totalMosaic: 0, recipient: false};
    };
};


module.exports.service = service;
}());

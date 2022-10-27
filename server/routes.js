// var clientproxy_routes = require('./clientproxy/routes');

const router = require('express').Router();
const clientproxy = require('./clientproxy/clientproxy');

router.post('/getnftsbywallet', clientproxy.getNFTsbyWallet); // updated

router.post('/getgamelist', clientproxy.getGameList); // updated
router.post('/getgamelistthumbnails', clientproxy.getGameListThumbnails); // newly updated

router.post('/getmygamelist', clientproxy.getMyGameList); // updated
router.post('/getmygamelistthumbnails', clientproxy.getMyGameListThumbnails); // newly updated

router.post('/getgamedetail', clientproxy.getGameDetail);

router.post('/getgamewinner', clientproxy.getGameWinner);

router.post('/iswingsnftusing', clientproxy.isWingsNftUsing);

router.post('/getmylockedwings', clientproxy.getMyLockedWings);

// organizer
router.post('/serializecreategametransaction', clientproxy.serializeCreateGameTransaction); // done    check
router.post('/creategame', clientproxy.createGame);

router.post('/serializeendgametransaction', clientproxy.serializeEndGameTransaction); // done     check
router.post('/endgame', clientproxy.endGame);

router.post('/serializelockwingstokentransaction', clientproxy.serializeLockWingsTokenTransaction); // done   check
router.post('/lockwingstoken', clientproxy.lockWingsToken);

router.post('/serializeunlockwingstokentransaction', clientproxy.serializeUnlockWingsTokenTransaction); // done   check
router.post('/unlockwingstoken', clientproxy.unlockWingsToken);

router.post('/serializerecreategametransaction', clientproxy.serializeRecreateGameTransaction); // done   check
router.post('/recreategame', clientproxy.recreateGame);

router.post('/serializegetbacknfttransaction', clientproxy.serializeGetBackNFTTransaction); // done check
router.post('/getbacknft', clientproxy.getBackNFT);

router.post('/serializeclaimsolfororgtransaction', clientproxy.serializeClaimSolForOrgTransaction); // done check
router.post('/claimsolfororg', clientproxy.claimSolForOrg);

router.post('/serializeclaimtokenfororgtransaction', clientproxy.serializeClaimTokenForOrgTransaction); // done    check
router.post('/claimtokenfororg', clientproxy.claimTokenForOrg);

router.post('/getgameinfofororg', clientproxy.getGameInfoForOrg);

// buyer
router.post('/serializebuyticketstransaction', clientproxy.serializeBuyTicketsTransaction); // done   check
router.post('/buytickets', clientproxy.buyTickets);

router.post('/serializeclaimairdroptransaction', clientproxy.serializeClaimAirdropTransaction); // done   check
router.post('/claimairdrop', clientproxy.claimAirdrop);

router.post(
  '/serializewithdrawfundsfromcancelledgametransaction',
  clientproxy.serializeWithdrawFundsFromCancelledGameTransaction
); // done check
router.post('/withdrawfundsfromcancelledgame', clientproxy.withdrawFundsFromCancelGame);

router.post('/serializeclaimnftfromendedgametransaction', clientproxy.serializeClaimNftFromEndedGameTransaction); // done    check
router.post('/claimnftfromendedgame', clientproxy.claimNftFromEndedGame);

router.post('/serializestakefreelynfttransaction', clientproxy.serializeStakeFreelyNftTransaction); // done check
router.post('/stakefreelynft', clientproxy.stakeFreelyNft);

router.post('/serializeunstakefreelynfttransaction', clientproxy.serializeUnstakeFreelyNftTransaction);
router.post('/unstakefreelynft', clientproxy.unStakeFreelyNft);

router.post('/getuserinfo', clientproxy.getUserInfo); // done

router.post('/getbidinfo', clientproxy.getBidInfo);

router.post('/getpurchasehistorypergame', clientproxy.getPurchaseHistoryPerGame); // done

router.post('/getnotification', clientproxy.getNotification); // done
router.post('/marknotificationasread', clientproxy.markNotificationAsRead); // done

router.post('/getgameranks', clientproxy.getGameRanks); // done

router.post('/checkuserwhitelisted', clientproxy.checkUserWhitelisted); // done

router.post('/getcountdownstatus', clientproxy.getCountdownStatus);

// development routes
router.post('/genratedummygames', clientproxy.generateDummyGames);

module.exports = router;


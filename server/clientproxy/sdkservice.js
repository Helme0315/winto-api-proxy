var web3 = require('@solana/web3.js');

var { WintoSDK, OrganizerWrapper, UserWrapper } = require('winto-sdk');
var { SolanaProvider } = require('@saberhq/solana-contrib');
const network = process.env.NODE_CUSTOM_RPC;
const timeout = process.env.NODE_TX_CONFIRMATION_TIMEOUT;
const opts = {
  preflightCommitment: 'processed',
  confirmTransactionInitialTimeout: timeout,
  disableRetryOnRateLimit: false
};

const connection = new web3.Connection(network, opts);

const botWallet = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.NODE_BOT_WALLET)));

const provider = SolanaProvider.init({
  connection,
  wallet: botWallet,
  opts
});

const wintoSDK = WintoSDK.load({ provider });

async function serializeRawTransactionWithSigners(tx, feePayer) {
  const transaction = tx.build();
  transaction.recentBlockhash = (await tx.provider.connection.getLatestBlockhash('finalized')).blockhash;

  transaction.feePayer = new web3.PublicKey(feePayer);
  transaction.sign(botWallet);

  return transaction.serialize({
    verifySignatures: false
  });
}

exports.getGameInfo = async function (game_pda_address) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, game_pda_address);
    const getGameInfo = await organizerWrapper.getGameInfo(game_pda_address);
    return getGameInfo;
  } catch (err) {
    console.log('getGameInfo :>> ', err);
    return null;
  }
};

exports.getGamePdaAddress = async function (game_time_stamp, wallet) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, wallet);
    const gamePdaAddress = await organizerWrapper.findGamePdaAddress(game_time_stamp, wallet);
    return gamePdaAddress;
  } catch (err) {
    console.log('getGamePdaAddress: ', err);
    return null;
  }
};

exports.fetchUserDetails = async function (user_wallet) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, user_wallet);
    const userDetails = await organizerWrapper.fetchUserDetails(user_wallet);
    return userDetails;
  } catch (err) {
    console.log('fetchUserDetails: ', err);
    return null;
  }
};

exports.findUserDetailsPdaAddress = async function (user_wallet) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, user_wallet);
    const userPda = await organizerWrapper.findUserDetailsPdaAddress(user_wallet);
    return userPda.toString();
  } catch (err) {
    console.log('findUserDetailsPdaAddress: ', err);
    return null;
  }
};

exports.serializeCreateGameRPC = async function (
  creator,
  ticketTokenAddress,
  ticketPrice,
  minimumCost,
  proof,
  gameTimeStamp,
  duration,
  coinType,
  nftAddressList,
  wingsType,
  wingsNftMintAddress
) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const tx = await organizerWrapper.createGame({
      ticketTokenAddress,
      ticketPrice,
      minimumCost,
      proof,
      gameTimeStamp,
      duration,
      coinType,
      nftAddressList,
      wingsType,
      wingsNftMintAddress
    });

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    console.log('err1 :>> ', err);
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

async function parseProgramError(error) {
  if (error && error.logs) {
    const log = error.logs.find((logError) => logError.includes('Error Number:'));
    if (log === undefined) {
      const fundsError = error.logs.find((logError) => logError.includes('custom program error: 0x1'));
      if(fundsError === undefined) return JSON.stringify(error);
      const errorMessage = 'Error: Your balance is not enough';
      return errorMessage;
    }
    // const errorNumber = log.substring(log.indexOf('Error Number:') + 13, log.indexOf('Error Message:') - 2);
    const errorMessage = 'Error: ' + log.substring(log.indexOf('Error Message:') + 14, log.length);
    // const errorStr = `Error: ${errorNumber} - ${errorMessage}`;
    return errorMessage;
  } else {
    return 'Error: Network error';
  }

  return JSON.stringify(error);
}

exports.confirmTransactions = async (tx) => {
  try {
    // tx.recentBlockhash = await connection.getLatestBlockhash("processed")
    let signature = await connection.sendRawTransaction(tx);

    let ret = await connection.confirmTransaction(signature, 'finalized');
    // console.log('ret :>> ', ret);
    if (ret.value.err !== null) {
      console.log(ret.value.err);
      return { result: false, message: ret.value.err };
    }

    return signature;
  } catch (err) {
    console.log('err :>> ', err);
    let err_response = await parseProgramError(err);
    return { result: false, message: err_response };
  }
};

exports.serializeLockWingstokenRPC = async function (mintNft, userWallet) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, userWallet);
    const tx = await organizerWrapper.lockWingsNft(mintNft);

    return await serializeRawTransactionWithSigners(tx, userWallet);
  } catch (err) {
    console.log(err);
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeUnlockWingstokenRPC = async function (userWalletAddress, wings_nft) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, userWalletAddress);
    const tx = await organizerWrapper.unlockWingsNft(wings_nft);

    return await serializeRawTransactionWithSigners(tx, userWalletAddress);
  } catch (err) {
    console.log('err :>> ', err);
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.fetchAllGamesByOrganizer = async function (user_wallet) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, user_wallet);
    const gameList = await organizerWrapper.fetchAllGamesByOrganizer();
    return gameList;
  } catch (err) {
    console.log('fetchAllGamesByOrganizer: ', err);
    return null;
  }
};

exports.getCurrentBlockTime = async function (user_wallet) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, user_wallet);
    const timestamp = await organizerWrapper.getCurrentBlockTime();
    return timestamp;
  } catch (err) {
    console.log('getCurrentBlockTime: ', err);
    return 0;
  }
};

exports.serializeRecreateGameRPC = async function (
  proof,
  gameTimeStamp,
  oldGamePda,
  creator,
  wingsType,
  wingsNftMintAddress,
  duration
) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const tx = await organizerWrapper.recreateGame({
      proof,
      gameTimeStamp,
      oldGamePda,
      wingsType,
      wingsNftMintAddress,
      duration
    });

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeEndGameRPC = async function (randomNumber, gamePda, creator) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const tx = await organizerWrapper.endGame({
      randomNumber,
      gamePda
    });

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeGetBackNFTRPC = async function (creator, gamePda) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const tx = await organizerWrapper.organizerGetBackNft(gamePda);

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeClaimSolForOrgTransaction = async function (creator, gamePda) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const tx = await organizerWrapper.organizerProcessGameSol(gamePda);

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeClaimTokenForOrgTransaction = async function (creator, gamePda) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const tx = await organizerWrapper.organizerProcessGameToken(gamePda);

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.claimAirdropTransactionRPC = async function (creator, type) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, creator);
    const rewardType = type;
    const tx = await userWrapper.userClaimAirdropWin({ rewardType });

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeWithdrawFundsFromCancelledGameRPC = async function (creator, gamePda) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, creator);
    const tx = await userWrapper.userWithdrawFunds(gamePda);

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeStakeFreelyNftRPC = async function (creator, mintNft) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, creator);
    const tx = await userWrapper.stakeFreelyNft(mintNft);

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeUnstakeFreelyNftRPC = async function (creator, mintNft) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, creator);
    const tx = await userWrapper.unstakeFreelyNft();

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.getBidList = async function (userWallet, gamePda) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, userWallet);
    const bidLIst = await userWrapper.getMyGameBidList(userWallet, gamePda);
    return bidLIst;
  } catch (err) {
    console.log('getBidList: ', err);
    return null;
  }
};

exports.serializeBidPRC = async function (user_wallet, gamePda, ticketAmount, bonusTicketAmount, bidNumber, randomNumber) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, user_wallet);
    let tx = null;
    if (bidNumber == 1) {
      tx = await userWrapper.createUserGlobalBidPda(
        {
          ticketAmount,
          bonusTicketAmount,
          randomNumber
        },
        gamePda
      );
    } else {
      tx = await userWrapper.userGameBid(
        {
          ticketAmount,
          bonusTicketAmount,
          randomNumber,
          bidNumber
        },
        gamePda
      );
    }

    return await serializeRawTransactionWithSigners(tx, user_wallet);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.serializeClaimNftFromEndedGameRPC = async function (creator, gamePda) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, creator);
    const tx = await userWrapper.winnerClaimNft(gamePda);

    return await serializeRawTransactionWithSigners(tx, creator);
  } catch (err) {
    let err_response = await parseProgramError(err);
    return { message: err_response };
  }
};

exports.getGameBidList = async function (random, gamePda) {
  try {
    const userWrapper = new UserWrapper(wintoSDK, random);
    const bidLIst = await userWrapper.getGameBidList(gamePda);
    return bidLIst;
  } catch (err) {
    console.log('getGameBidList: ', err);
    return null;
  }
};

exports.fetchGameListByWingsAddress = async function (creator, wingsAddress) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const gameList = await organizerWrapper.fetchGameListByWingsAddress(wingsAddress);
    return gameList;
  } catch (err) {
    console.log('fetchGameListByWingsAddress: ', err);
    return null;
  }
};

exports.fetchLockedWings = async function (creator) {
  try {
    const organizerWrapper = new OrganizerWrapper(wintoSDK, creator);
    const lockedWingsList = await organizerWrapper.fetchLockedWings();
    return lockedWingsList;
  } catch (err) {
    console.log('fetchLockedWings: ', err);
    return null;
  }
};

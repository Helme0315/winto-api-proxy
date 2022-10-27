const db = require('./database');
const sdk = require('./sdkservice');
var anchor = require('@project-serum/anchor');
const async = require('async');
const { PublicKey, Connection } = require('@solana/web3.js');
const imageThumbnail = require('image-thumbnail');
const web3 = require('@solana/web3.js');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');
const { TOKEN_PROGRAM_ID, Token } = require('@solana/spl-token');
const network = process.env.NODE_CUSTOM_RPC;
const timeout = process.env.NODE_TX_CONFIRMATION_TIMEOUT;
const axios = require('axios');
const constants = require('./constants');
const random = require('random');
const exactMath  = require('exact-math');
const opts = {
  preflightCommitment: 'processed',
  confirmTransactionInitialTimeout: timeout,
  disableRetryOnRateLimit: true
};

const connection = new Connection(network, opts);

exports.getGameList = async function (req, res) {
  const { type, status, user_wallet, is_mine, is_bought, search, coin_type, claimed_nft_type } = req.body;

  // db.get_game_list
  // reference database.js

  // return format:
  // - failed: when error_code is set, assumed as error. error_code will have error message
  // - succeed: {results: [
  //   {
  //     coin_type: enum['sol', 'win'],
  //     current_ticket_sales: number,
  //     ends_time: datetime,
  //     game_type: enum['gold', 'silver', 'bronze', null],
  //     id: number,
  //     is_bought: boolean,
  //     is_mine: boolean,
  //     nft_mint_address: string,
  //     nft_name: string,
  //     nft_symbol: string;
  //     status: enum["open", "closed", "cancelled"],
  //     target_tickets: number,
  //     thumbnail: string,
  //     ticket_price: number
  //   }
  // ]}
  // let onChainGameList = null;
  // if(type == "my_games") {
  //   onChainGameList = await sdk.fetchAllGamesByOrganizer(user_wallet);
  // }

  db.get_game_list(type, status, user_wallet, is_mine, is_bought, search, coin_type, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    // if(type == "my_games") {
    //   if(rows.length > 0 && onChainGameList.length > 0) {
    //     rows.map((game) => {
    //       const onChainGameDetail = onChainGameList.find(e => e.publicKey.toString() == game.pda_address)
    //       if(onChainGameDetail) {
    //         rows['funds_status'] = onChainGameDetail.account.fundsStatus;
    //         rows['is_nft_unstaked'] = onChainGameDetail.account.isNftUnstaked;
    //       } else {
    //         rows['funds_status'] = false;
    //         rows['is_nft_unstaked'] = false;
    //       }

    //     })
    //   }
    // }
    return res.json({ result: rows });
  });
};

exports.getGameListThumbnails = function (req, res) {
  const { type, status, user_wallet, is_mine, is_bought, search, coin_type, pg_size, pg_offset } = req.body;

  // db.get_game_list_thumbnail
  // This is called only when game list result is more than 8, and won't be called from dapp if it's less or all fetched.
  // reference database.js

  // params:
  // params are the same with getGameList except this has pg_size and pg_offset

  // return format:
  // * will return only game id and thumbnails
  // - failed: when error_code is set, assumed as error. error_code will have error message
  // - succeed: {results: [
  //   game_id:
  //   thumbnail:
  // ]}

  if (pg_offset === undefined || parseInt(pg_offset) < 0 || !pg_size || parseInt(pg_size) == 0) {
    return res.send({ error_code: 'Wrong pagination' });
  }

  db.get_game_list_thumbnails(
    type,
    status,
    user_wallet,
    is_mine,
    is_bought,
    search,
    coin_type,
    pg_size,
    pg_offset,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.json({ error_code: err.errno });
      }
      return res.json({ result: rows });
    }
  );
};

exports.getGameDetail = function (req, res) {
  const { pda_address, wallet_address } = req.body;

  if (!pda_address) {
    return res.json({ error_code: 'Invalid game id.' });
  }

  db.get_game_detail(pda_address, wallet_address, async (err, row) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    if (!row) {
      return res.json({ error_code: 'This is not registered game' });
    }
    let result = {};
    let on_chain_data = await sdk.getGameInfo(pda_address);
    result['onChain'] = on_chain_data;
    result['offChain'] = row;
    return res.json({ result: result });
  });
};

exports.getGameWinner = async function (req, res) {
  const { game_pda } = req.body;

  if (!game_pda) {
    return res.json({ error_code: 'Invalid game pda.' });
  }

  let onchain_game_data = await sdk.getGameInfo(game_pda);

  if (onchain_game_data) {
    const cur_time_stamp = await sdk.getCurrentBlockTime(game_pda);

    if (cur_time_stamp < onchain_game_data.openedTimestamp + onchain_game_data.duration) {
      return res.json({ winner: null, status: 'open' });
    }
    if (
      new anchor.BN(onchain_game_data.ticketPrice).mul(new anchor.BN(onchain_game_data.currentTotalTickets)).toNumber() <
      new anchor.BN(onchain_game_data.minimumCost).toNumber()
    ) {
      return res.json({ winner: null, status: 'cancelled' });
    }

    const gameBidList = await sdk.getGameBidList(game_pda, game_pda);
    const finanlized_random_number = onchain_game_data.winnerRandomNumber;
    let winner = null;
    let is_claimed = false;
    if (gameBidList && gameBidList.length > 0) {
      gameBidList.sort((a, b) => a.account.openedTimestamp - b.account.openedTimestamp);
      let start_index = 1;
      for (let i = 0; i < gameBidList.length; i++) {
        if (
          start_index <= finanlized_random_number[0] &&
          start_index +
            gameBidList[i].account.boughtTicketAmount +
            gameBidList[i].account.bonusTicketAmount +
            gameBidList[i].account.freelyTicketAmount -
            1 >=
            finanlized_random_number[0]
        ) {
          winner = gameBidList[i].account.userWallet.toString();
        }

        start_index =
          start_index +
          gameBidList[i].account.boughtTicketAmount +
          gameBidList[i].account.bonusTicketAmount +
          gameBidList[i].account.freelyTicketAmount;

        if (gameBidList[i].account.bidNumber == 1 && gameBidList[i].account.winnerNftClaim == true) {
          is_claimed = true;
        }
        if (is_claimed == true && winner != null) {
          break;
        }
      }
    }
    return res.json({ winner, status: 'closed', is_claimed });
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }
};

exports.serializeCreateGameTransaction = async function (req, res) {
  // create game
  // params' name will follow sdk naming
  const {
    ticket_token_address,
    ticket_price,
    minimum_cost,
    end_time,
    coin_type,
    creator_wallet_address,
    nft_mint_address_list,
    wings_nft_mint
  } = req.body;
  // reference KN-P/ clientproxy / serilizeSellTransaction
  // steps:
  // - some kind of validation: will need to discuss with paul
  // - db.prepare_new_game: KN-P / database.js / ah_prepare_new_order
  // - sdk.createGamePRC: KN-P / sdkservice.js / serializeSellRPC
  // return format
  // {
  //   reservedGameId: game table id,
  //   tx: serializedTX
  // }

  if (!ticket_token_address) return res.json({ error_code: 'Wrong ticket token address' });
  if (!creator_wallet_address) return res.json({ error_code: 'Wrong wallet address' });
  if (isNaN(ticket_price)) return res.json({ error_code: 'Wrong ticket price' });
  if (isNaN(minimum_cost)) return res.json({ error_code: 'Wrong ticket price' });
  if (!end_time) return res.json({ error_code: 'Wrong end time' });
  if (nft_mint_address_list.length == 0) return res.json({ error_code: 'Please deposit NFT' });

  const game_time_stamp = await sdk.getCurrentBlockTime(creator_wallet_address);
  let duration = end_time - game_time_stamp;
  if (duration <= 0) {
    return res.send({ error_code: 'Invalid time' });
  }
  const game_pda_address = await sdk.getGamePdaAddress(game_time_stamp, creator_wallet_address);

  const myWings = await sdk.fetchLockedWings(creator_wallet_address);
  if (wings_nft_mint) {
    let is_locked_wings = false;
    if (myWings && myWings.length > 0) {
      for (let i = 0; i < myWings.length; i++) {
        if (myWings[i].account.wingsNftMint.toString() == wings_nft_mint) {
          is_locked_wings = true;
          break;
        }
      }
    }
    if (!is_locked_wings) {
      return res.send({ error_code: 'You did not lock selected Wings NFT.' });
    }
    const wingsGameList = await sdk.fetchGameListByWingsAddress(creator_wallet_address, wings_nft_mint);
    if (wingsGameList && wingsGameList.length > 0) {
      for (let i = 0; i < wingsGameList.length; i++) {
        if (game_time_stamp < wingsGameList[i].account.openedTimestamp + wingsGameList[i].account.duration) {
          return res.send({ error_code: 'Please select other Wings NFT. This NFT was choosen by other game.' });
        }
      }
    }
  } else {
    if(myWings && myWings.length > 0) {
      return res.send({ error_code: 'You can create the game with locked Wings NFT.' });
    }
  }

  const userPda = await sdk.findUserDetailsPdaAddress(creator_wallet_address);
  const userInfo = await sdk.fetchUserDetails(userPda);

  const gameList = await sdk.fetchAllGamesByOrganizer(creator_wallet_address);
  let openedGame = 0;
  if (gameList && gameList.length > 0) {
    for (var i = 0; i < gameList.length; i++) {
      if (game_time_stamp < gameList[i].account.openedTimestamp + gameList[i].account.duration) {
        openedGame++;
      }
    }
  }

  nft_mint_address_list.sort();

  const nft_metadata_list = [];
  for (let i = 0; i < nft_mint_address_list.length; i++) {
    try {
      const nft_metadata = await getNftMetadata(nft_mint_address_list[i]);
      if (!nft_metadata) {
        return res.send({ error_code: 'Invalid NFT info.' });
      }
      nft_metadata_list.push(nft_metadata);
    } catch (err) {
      console.error(err);
      return res.send({ error_code: err.message });
    }
    // to-do
    // we need to consider delay on this function and tx might get failed.
    await sleep(process.env.NODE_OFF_CHAIN_METADATA_CALL_INTERVAL);
  }

  let game_type = null;
  let wingsType = 0;
  if (wings_nft_mint) {
    const wingsMetadata = await getWingsNftType(wings_nft_mint);
    if (wingsMetadata == 'Gold') {
      game_type = constants.GameType.Gold;
      wingsType = constants.WingsType.Gold;
    } else if (wingsMetadata == 'Silver') {
      game_type = constants.GameType.Silver;
      wingsType = constants.WingsType.Silver;
    } else if (wingsMetadata == 'Bronze') {
      game_type = constants.GameType.Bronze;
      wingsType = constants.WingsType.Bronze;
    }
  }

  let exist_game = null;
  try {
    exist_game = await db.check_game_exist(creator_wallet_address, JSON.stringify(nft_mint_address_list));
  } catch (e) {
    return res.send({ error_code: e.errno });
  }

  db.prepare_new_game(
    game_pda_address.toString(),
    creator_wallet_address,
    game_time_stamp,
    coin_type,
    ticket_price,
    duration,
    minimum_cost,
    nft_metadata_list,
    game_type,
    nft_mint_address_list,
    wings_nft_mint,
    exist_game['id'],
    async (err, rows) => {
      if (err) {
        return res.send({ error_code: err.errno, db_error_code: err.code });
      }
      if (rows.length === 0) {
        return res.send({ error_code: 'Failed to create game.' });
      }

      const proof = rows[0].proof && rows[0].proof.length ? rows[0].proof.map((x) => Buffer.from(x.data)) : [];

      if (proof.length == 0 && !wings_nft_mint) {
        return res.send({ error_code: 'You must choose Wings NFT to create a game.' });
      }
      if (proof.length == 0 && wingsType == 0) {
        return res.send({ error_code: 'Please select Wings NFT.' });
      }

      if (userInfo) {
        if (proof.length == 0 || (proof.length > 0 && userInfo.wingsLockedCount > 0)) {
          if (openedGame >= userInfo.wingsLockedCount) {
            return res.send({ error_code: 'You can not create game now. Lock more Wings NFT to create game.' });
          }
        } else {
          if (openedGame >= 1) {
            return res.send({ error_code: 'Whitelist user can create one game. Please end other game to create new one.' });
          }
        }
      } else if (!userInfo) {
        if (proof.length == 0) {
          return res.send({ error_code: 'Please lock Wings NFT to create game.' });
        } else if (proof.length > 0 && openedGame >= 1) {
          return res.send({ error_code: 'Whitelist user can create one game. Please end other game to create new one.' });
        }
      }

      const response = await sdk.serializeCreateGameRPC(
        creator_wallet_address,
        ticket_token_address,
        ticket_price,
        minimum_cost,
        proof,
        game_time_stamp,
        duration,
        coin_type,
        nft_mint_address_list,
        wingsType,
        wings_nft_mint
      );

      if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

      return res.json({
        reservedGameId: rows[0].id,
        instruction: [...new Uint8Array(response)]
      });

      // res.send([...new Uint8Array(response)]);
    }
  );
};

exports.createGame = async function (req, res) {
  const { reservedGameId, organizer_wallet_address, tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahListNftToMarket

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });
  if (!reservedGameId) return res.send({ error_code: 'Wrong game id.' });
  if (!organizer_wallet_address) return res.send({ error_code: 'Wrong organizer wallet address.' });

  // sdk confirm transactions

  const response = await sdk.confirmTransactions(tx);
  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  // will need to add is_processed, signature to the games table
  // ref: KN-P/ database.js / ah_list_new_order
  db.create_new_game(reservedGameId, organizer_wallet_address, (err) => {
    if (err) {
      console.error(err);
      return res.send({ error_code: err.errno, db_error_code: err.code });
    }
    return res.send({ signature });
  });
};

exports.serializeEndGameTransaction = async function (req, res) {
  // end game
  const { pda_address, org_pubkey } = req.body;

  if (!pda_address) return res.send({ error_code: 'Wrong game address' });
  if (!org_pubkey) return res.send({ error_code: 'Wrong organizer address' });

  const userPda = await sdk.findUserDetailsPdaAddress(org_pubkey);
  const userInfo = await sdk.fetchUserDetails(userPda);

  const gameList = await sdk.fetchAllGamesByOrganizer(org_pubkey);
  const game_time_stamp = await sdk.getCurrentBlockTime(org_pubkey);
  let openedGame = 0;
  if (gameList && gameList.length > 0) {
    for (var i = 0; i < gameList.length; i++) {
      if (game_time_stamp < gameList[i].account.openedTimestamp + gameList[i].account.duration) {
        openedGame++;
      }
    }
  }

  if (userInfo && userInfo.wingsLockedCount > 0) {
    if (openedGame > userInfo.wingsLockedCount) {
      return res.send({ error_code: 'You can not create game now. Lock Wings NFT more to create game.' });
    }
  }

  // reference KN-P/ clientproxy / ahSerializeAcceptBidTransaction
  // steps:
  // - check game creator with org_pubkey, game status is open

  db.get_game_info(pda_address, async (err, rows) => {
    if (err) {
      return res.send({ error_code: err.errno, db_error_code: err.code });
    }
    if (!rows) {
      return res.send({ error_code: 'Wrong game info.' });
    }
    if (org_pubkey != rows.creator_wallet_address) return res.send({ error_code: 'Wrong organizer address' });

    // - select winner from bidders
    // -- get bidders from db
    // --- db.get_bidders_from_game_id(game_id)  ref: KN / database.js/ah_get_bid_info
    // - pick winner by random algorithm
    // - call rpc to end game
    // -- tx = sdk.serializeEndGameRPC : ref: KN / sdkservice.js / serializeAcceptBidRPC

    const gameInfo = await sdk.getGameInfo(pda_address, org_pubkey);

    const totalTickets = gameInfo.currentTotalTickets + gameInfo.currentTotalBonusTickets;
    if (totalTickets == 0) {
      return res.send({ error_code: 'Anybody did not buy tickets. Can not end game.' });
    }

    let randomNumber = [];
    for (var i = 0; i < 6; i++) {
      randomNumber.push(random.int(1, totalTickets));
    }

    const response = await sdk.serializeEndGameRPC(randomNumber, pda_address, gameInfo.nftOwnerWallet.toString());

    if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

    const bidders = await sdk.getGameBidList(gameInfo.nftOwnerWallet.toString(), pda_address);

    let winnerPubkey = null;
    if (bidders && bidders.length > 0) {
      bidders.sort((a, b) => a.account.openedTimestamp - b.account.openedTimestamp);
      let start_index = 1;
      for (var i = 0; i < bidders.length; i++) {
        if (
          start_index <= randomNumber[0] &&
          start_index +
            bidders[i].account.boughtTicketAmount +
            bidders[i].account.bonusTicketAmount +
            bidders[i].account.freelyTicketAmount -
            1 >=
            randomNumber[0]
        ) {
          winnerPubkey = bidders[i].account.userWallet.toString();
          break;
        }
        start_index =
          start_index +
          bidders[i].account.boughtTicketAmount +
          bidders[i].account.bonusTicketAmount +
          bidders[i].account.freelyTicketAmount;
      }
    }

    const new_duration = game_time_stamp - gameInfo.openedTimestamp;

    const temp = exactMath.mul(rows.ticket_price, gameInfo.currentTotalTickets)
    
    const new_minimum_cost = exactMath.mul(rows.ticket_price, gameInfo.currentTotalTickets)
    db.update_by_end_game(rows.id, new_duration, new_minimum_cost.toString(), org_pubkey, (err) => {
      if (err) {
        console.error(err);
        return res.send({ error_code: err.errno, db_error_code: err.code });
      }
      return res.json({
        game_id: rows.id,
        instruction: [...new Uint8Array(response)],
        winner_pubkey: winnerPubkey
      });
    });
  });

  // return format
  // {
  //   game_id: game table id,
  //   tx: serializedTX,
  //   winner_pubkey: string
  // }
};

exports.endGame = async function (req, res) {
  const { tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft
  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions
  const response = await sdk.confirmTransactions(tx);
  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });
  const signature = response;

  return res.send({ signature });
};

exports.serializeLockWingsTokenTransaction = async function (req, res) {
  const { user_wallet, wings_token_mint } = req.body;

  if (!user_wallet) return res.send({ error_code: 'Wrong user wallet' });
  if (!wings_token_mint) return res.send({ error_code: 'Wrong wings token mint address' });

  // grab wings_token_mint meta
  // check ownner_wallet, and grab wings_level
  // confirm user_wallet === owner_wallet

  const wingsMetadata = await getWingsNftType(wings_token_mint);
  let wingsType = 0;
  if (wingsMetadata == 'Gold') {
    wingsType = 1;
  } else if (wingsMetadata == 'Silver') {
    wingsType = 2;
  } else if (wingsMetadata == 'Bronze') {
    wingsType = 3;
  }
  if (wingsType == 0) {
    return res.send({ error_code: 'Please lock wings nft.' });
  }
  const response = await sdk.serializeLockWingstokenRPC(wings_token_mint, user_wallet);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });
  return res.json({
    instruction: [...new Uint8Array(response)]
  });
};

exports.lockWingsToken = async function (req, res) {
  const { tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  // return signature

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message });

  const signature = response;
  return res.send({ signature });
};

exports.serializeUnlockWingsTokenTransaction = async function (req, res) {
  const { user_wallet, wings_token_mint } = req.body;

  if (!user_wallet) return res.send({ error_code: 'Wrong user wallet' });
  if (!wings_token_mint) return res.send({ error_code: 'Wrong wings token mint address' });
  // tx = sdk.serializeUnlockWingstokenRPC(user_wallet)

  // return format
  // {
  //   tx: serializedTX
  // }

  const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);

  if (wings_token_mint) {
    const wingsGameList = await sdk.fetchGameListByWingsAddress(user_wallet, wings_token_mint);
    if (wingsGameList && wingsGameList.length > 0) {
      for (let i = 0; i < wingsGameList.length; i++) {
        if (game_time_stamp < wingsGameList[i].account.openedTimestamp + wingsGameList[i].account.duration) {
          return res.send({ error_code: 'There is opened game with this Wings NFT. You can not unlock now.' });
        }
      }
    }
  }

  const response = await sdk.serializeUnlockWingstokenRPC(user_wallet, wings_token_mint);
  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });
  return res.json({
    instruction: [...new Uint8Array(response)]
  });
};

exports.unlockWingsToken = async function (req, res) {
  const { tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  return res.send({ signature });
};

exports.serializeRecreateGameTransaction = async function (req, res) {
  const { user_wallet, pda_address, wings_nft_mint, end_time } = req.body;

  // get old game PDA, nft_mint_address, creator_wallet_address:
  // confirm user_wallet === creator_wallet_address
  // confirm user_wallet === nft owner
  // get wings_level from user_info

  // set is_processed = false, create_date=now(), wings_level=[current], duration  in games table
  // remove all bids from bidders

  // get proof? : get proof from user_wallet?
  // call sdk with old_game_pda
  // - sdk.serializeRecreateGameRPC(user_wallet, game_pda, proof)

  // tx = sdk.serializeRecreateGameRPC(user_wallet, wings_token_mint, wings_level)

  // return format
  // {
  //   tx: serializedTX
  // }

  if (!user_wallet) return res.send({ error_code: 'Wrong user wallet' });
  if (!pda_address) return res.send({ error_code: 'Wrong game address' });
  if (!end_time) return res.send({ error_code: 'Wrong end time' });

  const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
  let duration = end_time - game_time_stamp;
  if (duration <= 0) {
    return res.send({ error_code: 'Invalid time' });
  }
  const game_pda_address = await sdk.getGamePdaAddress(game_time_stamp, user_wallet);

  if (wings_nft_mint) {
    const myWings = await sdk.fetchLockedWings(user_wallet);
    let is_locked_wings = false;
    if (myWings && myWings.length > 0) {
      for (let i = 0; i < myWings.length; i++) {
        if (myWings[i].account.wingsNftMint.toString() == wings_nft_mint) {
          is_locked_wings = true;
          break;
        }
      }
    }
    if (!is_locked_wings) {
      return res.send({ error_code: 'You did not lock selected Wings NFT.' });
    }
    const wingsGameList = await sdk.fetchGameListByWingsAddress(user_wallet, wings_nft_mint);
    if (wingsGameList && wingsGameList.length > 0) {
      for (let i = 0; i < wingsGameList.length; i++) {
        if (game_time_stamp < wingsGameList[i].account.openedTimestamp + wingsGameList[i].account.duration) {
          return res.send({ error_code: 'Please select other Wings NFT. This NFT was choosen by other game.' });
        }
      }
    }
  }

  const gameList = await sdk.fetchAllGamesByOrganizer(user_wallet);
  let openedGame = 0;
  if (gameList && gameList.length > 0) {
    for (var i = 0; i < gameList.length; i++) {
      if (game_time_stamp < gameList[i].account.openedTimestamp + gameList[i].account.duration) {
        openedGame++;
      }
    }
  }

  let game_type = null;
  let wingsType = 0;
  if (wings_nft_mint) {
    const wingsMetadata = await getWingsNftType(wings_nft_mint);
    if (wingsMetadata == 'Gold') {
      game_type = constants.GameType.Gold;
      wingsType = constants.WingsType.Gold;
    } else if (wingsMetadata == 'Silver') {
      game_type = constants.GameType.Silver;
      wingsType = constants.WingsType.Silver;
    } else if (wingsMetadata == 'Bronze') {
      game_type = constants.GameType.Bronze;
      wingsType = constants.WingsType.Bronze;
    }
  }

  const userPda = await sdk.findUserDetailsPdaAddress(user_wallet);
  const userInfo = await sdk.fetchUserDetails(userPda);

  let exist_game = null;
  try {
    exist_game = await db.get_game_details(pda_address, user_wallet);
    if (!exist_game) {
      return res.send({ error_code: 'Wrong game' });
    }
  } catch (e) {
    return res.send({ error_code: e.errno });
  }

  let onchain_game_data = await sdk.getGameInfo(pda_address);
  if (onchain_game_data) {
    if (onchain_game_data.nftOwnerWallet.toString() != user_wallet) {
      return res.json({ error_code: 'You are not owner of this game.' });
    }

    db.prepare_new_game(
      game_pda_address.toString(),
      user_wallet,
      game_time_stamp,
      exist_game['coin_type'],
      exist_game['ticket_price'],
      duration,
      exist_game['minimum_cost'],
      exist_game['nft_metadata'],
      game_type,
      exist_game['nft_mint_address'],
      wings_nft_mint,
      0,
      async (e, rows) => {
        if (e) {
          return res.send({ error_code: e.errno, db_error_code: e.code });
        }
        if (rows.length === 0) {
          return res.send({ error_code: 'Failed to create game.' });
        }

        const proof = rows[0].proof && rows[0].proof.length ? rows[0].proof.map((x) => Buffer.from(x.data)) : [];

        if (proof.length == 0 && !wings_nft_mint) {
          return res.send({ error_code: 'You must choose Wings NFT to create a game.' });
        }
        if (proof.length == 0 && wingsType == 0) {
          return res.send({ error_code: 'Please select Wings NFT.' });
        }

        if (userInfo) {
          if (proof.length == 0 || (proof.length > 0 && userInfo.wingsLockedCount > 0)) {
            if (openedGame >= userInfo.wingsLockedCount) {
              return res.send({ error_code: 'You can not create game now. Lock more Wings NFT to create game.' });
            }
          } else {
            if (openedGame >= 1) {
              return res.send({
                error_code: 'Whitelist user can create one game. Please end other game to create new one.'
              });
            }
          }
        } else if (!userInfo) {
          if (proof.length == 0) {
            return res.send({ error_code: 'Please lock Wings NFT to create game.' });
          } else if (proof.length > 0 && openedGame >= 1) {
            return res.send({
              error_code: 'Whitelist user can create one game. Please end other game to create new one.'
            });
          }
        }

        const response = await sdk.serializeRecreateGameRPC(
          proof,
          game_time_stamp,
          pda_address,
          user_wallet,
          wingsType,
          wings_nft_mint,
          duration
        );

        if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

        return res.json({
          reservedGameId: rows[0].id,
          instruction: [...new Uint8Array(response)]
        });

        // res.send([...new Uint8Array(response)]);
      }
    );
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }
};

exports.recreateGame = async function (req, res) {
  const { reservedGameId, organizer_wallet_address, tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });
  if (!reservedGameId) return res.send({ error_code: 'Wrong game id' });
  if (!organizer_wallet_address) return res.send({ error_code: 'Wrong wallet address' });
  // sdk confirm transactions

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  db.create_new_game(reservedGameId, organizer_wallet_address, (err) => {
    if (err) {
      console.error(err);
      return res.send({ error_code: err.errno, db_error_code: err.code });
    }
    return res.send({ signature });
  });
};

exports.serializeGetBackNFTTransaction = async function (req, res) {
  const { user_wallet, pda_address } = req.body;

  if (!pda_address) return res.send({ error_code: 'Wrong game address' });
  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });

  // get game PDA, creator_wallet_address
  // confirm user_wallet === creator_wallet_address

  let onchain_game_data = await sdk.getGameInfo(pda_address);
  if (onchain_game_data) {
    if (onchain_game_data.nftOwnerWallet.toString() != user_wallet) {
      return res.json({ error_code: 'You are not owner of this game.' });
    }
    const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
    if (
      new anchor.BN(onchain_game_data.ticketPrice).mul(new anchor.BN(onchain_game_data.currentTotalTickets)).toNumber() <
        new anchor.BN(onchain_game_data.minimumCost).toNumber() &&
      onchain_game_data.openedTimestamp + onchain_game_data.duration < game_time_stamp
    ) {
      const response = await sdk.serializeGetBackNFTRPC(user_wallet, pda_address);

      if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

      return res.json({
        instruction: [...new Uint8Array(response)]
      });
    } else {
      return res.json({ error_code: 'Game is not cancelled status.' });
    }
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }

  // call sdk
  // tx = sdk.serializeGetBackNFTRPC(user_wallet, game_pda);

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.getBackNFT = async function (req, res) {
  const { tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  return res.send({ signature });
};

exports.serializeClaimSolForOrgTransaction = async function (req, res) {
  const { user_wallet, pda_address } = req.body;

  if (!pda_address) return res.send({ error_code: 'Wrong game address' });
  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });

  // get game PDA, creator_wallet_address
  // confirm user_wallet === creator_wallet_address

  let onchain_game_data = await sdk.getGameInfo(pda_address);
  if (onchain_game_data) {
    if (onchain_game_data.nftOwnerWallet.toString() != user_wallet) {
      return res.json({ error_code: 'You are not owner of this game.' });
    }

    const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
    if (
      new anchor.BN(onchain_game_data.ticketPrice).mul(new anchor.BN(onchain_game_data.currentTotalTickets)).toNumber() >=
        new anchor.BN(onchain_game_data.minimumCost).toNumber() &&
      onchain_game_data.openedTimestamp + onchain_game_data.duration < game_time_stamp
    ) {
      const response = await sdk.serializeClaimSolForOrgTransaction(user_wallet, pda_address);

      if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

      return res.json({
        instruction: [...new Uint8Array(response)]
      });
    } else {
      return res.json({ error_code: 'Game is not clsoed status.' });
    }
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }

  // call sdk
  // tx = sdk.serializeClaimSolForOrgTransaction(user_wallet, game_pda);

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.claimSolForOrg = async function (req, res) {
  const { tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  return res.send({ signature });
};

exports.serializeClaimTokenForOrgTransaction = async function (req, res) {
  const { user_wallet, pda_address } = req.body;

  if (!pda_address) return res.send({ error_code: 'Wrong game address' });
  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });

  // get game PDA, creator_wallet_address
  // confirm user_wallet === creator_wallet_address

  let onchain_game_data = await sdk.getGameInfo(pda_address);
  if (onchain_game_data) {
    if (onchain_game_data.nftOwnerWallet.toString() != user_wallet) {
      return res.json({ error_code: 'You are not owner of this game.' });
    }

    const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
    if (
      new anchor.BN(onchain_game_data.ticketPrice).mul(new anchor.BN(onchain_game_data.currentTotalTickets)).toNumber() >=
        new anchor.BN(onchain_game_data.minimumCost).toNumber() &&
      onchain_game_data.openedTimestamp + onchain_game_data.duration < game_time_stamp
    ) {
      const response = await sdk.serializeClaimTokenForOrgTransaction(user_wallet, pda_address);

      if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

      return res.json({
        instruction: [...new Uint8Array(response)]
      });
    } else {
      return res.json({ error_code: 'Game is not closed status.' });
    }
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }

  // call sdk
  // tx = sdk.serializeClaimTokenForOrgTransaction(user_wallet, game_pda);

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.claimTokenForOrg = async function (req, res) {
  const { tx } = req.body;

  // Ref: KN-P/clientproxy.js/ahAcceptBidNft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  return res.send({ signature });
};

exports.getGameInfoForOrg = async function (req, res) {
  const { user_wallet, pda_address } = req.body;

  if (!pda_address) return res.send({ error_code: 'Wrong game address' });
  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });

  let onchain_game_data = await sdk.getGameInfo(pda_address);
  if (onchain_game_data) {
    if (onchain_game_data.nftOwnerWallet.toString() != user_wallet) {
      return res.json({ error_code: 'You are not owner of this game.' });
    }

    const gameInfo = sdk.getGameInfo(user_wallet, game_pda);

    return res.send({ gameInfo });
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }

  // call sdk
  // gameInfo = sdk.getGameInfo(user_wallet, game_pda);

  // return gameInfo;
};

// buyer functions

exports.serializeBuyTicketsTransaction = async function (req, res) {
  const { user_wallet, pda_address, tickets_amount, bonus_ticket_amount } = req.body;
  // reference KN-P/ clientproxy / ahSerializeBuyTransaction
  if (!pda_address) return res.send({ error_code: 'Wrong game id' });
  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });
  if (!tickets_amount && !bonus_ticket_amount) return res.send({ error_code: 'Wrong ticket amount' });

  // steps:
  // - check game is open
  // - db.prepare_new_buy(user_wallet, pda_address, tickets_amount): KN-P / database.js / ah_prepare_new_bid
  // -- get bidder_id by PSQL returning id
  // - sdk.serializeBidPRC ref: KN-P / sdkservice.js / serializeBuyAndExecuteSaleRPC
  // -- rpc in sdk should be different when first buy or not

  db.get_game_detail(pda_address, user_wallet, async (err, row) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    if (!row) {
      return res.json({ error_code: 'This is not registered game' });
    }
    const onchain_game_data = await sdk.getGameInfo(pda_address);
    if (onchain_game_data) {
      const cur_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
      if (cur_time_stamp > onchain_game_data.openedTimestamp + onchain_game_data.duration) {
        return res.json({ error_code: 'The game is not opened status.' });
      }

      const totalTickets =
        onchain_game_data.currentTotalTickets +
        onchain_game_data.currentTotalBonusTickets +
        tickets_amount +
        bonus_ticket_amount;
      let randomNumber = [];
      for (var i = 0; i < 6; i++) {
        randomNumber.push(randomNumber.push(random.int(1, totalTickets)));
      }

      const userBidList = await sdk.getBidList(user_wallet, pda_address);

      let bid_number = 1;
      if (userBidList && userBidList.length > 0) {
        for (let i = 0; i < userBidList.length; i++) {
          if (userBidList[i].account.bidNumber == 1) {
            bid_number = userBidList[i].account.totalBidNumber + 1;
            break;
          }
        }
      }
      db.prepare_new_buy(
        row['id'],
        cur_time_stamp,
        tickets_amount,
        bonus_ticket_amount,
        user_wallet,
        pda_address,
        async (e, r) => {
          if (e) {
            return res.send({ error_code: e.errno, db_error_code: e.code });
          }
          if (r.length === 0) {
            return res.send({ error_code: 'Failed to bid game.' });
          }

          const response = await sdk.serializeBidPRC(
            user_wallet,
            pda_address,
            tickets_amount,
            bonus_ticket_amount,
            bid_number,
            randomNumber
          );

          if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

          return res.json({
            bidderId: r[0].id,
            instruction: [...new Uint8Array(response)]
          });
        }
      );

      // return res.send({ gameInfo });
    } else {
      return res.send({ error_code: 'Wrong game address' });
    }
  });

  // return format
  // {
  //   bidderId: bidders table id,
  //   tx: serializedTX
  // }
};

exports.buyTickets = async (req, res) => {
  const { bid_id, tx } = req.body;
  // Ref: KN-P/clientproxy.js/ahbidnft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });
  if (!bid_id) return res.send({ error_code: 'Wrong bid id.' });

  // sdk confirm transactions
  // const response = await sdk.confirmTransactions(tx);

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  // will need to add is_processed, signature to the bidders table

  // ref: KN-P/ database.js / ah_prepare_new_bid
  // set is_processed = true in bidders table
  db.process_new_bid(bid_id, (err) => {
    if (err) {
      console.error(err);
      return res.send({ error_code: err.errno, db_error_code: err.code });
    }
    return res.send({ signature });
  });
};

exports.serializeClaimAirdropTransaction = async function (req, res) {
  const { user_wallet, reward_type } = req.body;
  // reference KN-P/ clientproxy / ahSerializeBuyTransaction

  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });
  if (!reward_type) return res.send({ error_code: 'Wrong reward type' });

  // steps:
  // ref: clientproxy.js / getEscrowBalance
  // call sdk and get tx
  // - ref: sdkservice.claimAirdropTransactionRPC

  const response = await sdk.claimAirdropTransactionRPC(user_wallet, reward_type);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  return res.json({
    instruction: [...new Uint8Array(response)]
  });

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.claimAirdrop = async (req, res) => {
  const { tx } = req.body;
  // Ref: KN-P/clientproxy.js/ahbidnft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions
  // const response = await sdk.confirmTransactions(tx);

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  const signature = response;

  return res.send({ signature });

  // ref: KN-P/ database.js / ah_prepare_new_bid

  // return {success: true / false}
};

exports.serializeWithdrawFundsFromCancelledGameTransaction = async function (req, res) {
  const { user_wallet, game_pda } = req.body;
  // reference KN-P/ clientproxy / ahSerializeWithdrawFromWallet

  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });
  if (!game_pda) return res.send({ error_code: 'Wrong game id' });

  let onchain_game_data = await sdk.getGameInfo(game_pda);
  if (onchain_game_data) {
    const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
    if (
      new anchor.BN(onchain_game_data.ticketPrice).mul(new anchor.BN(onchain_game_data.currentTotalTickets)).toNumber() <
        new anchor.BN(onchain_game_data.minimumCost).toNumber() &&
      onchain_game_data.openedTimestamp + onchain_game_data.duration < game_time_stamp
    ) {
      const response = await sdk.serializeWithdrawFundsFromCancelledGameRPC(user_wallet, game_pda);

      if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

      return res.json({
        instruction: [...new Uint8Array(response)]
      });
    } else {
      return res.json({ error_code: 'Game is not cancelled status.' });
    }
  } else {
    return res.send({ error_code: 'Wrong game address' });
  }
  // call sdk and get tx
  // tx = sdkservice.serializeWithdrawFundsFromEndedGameRPC(user_wallet, game_pda)

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.withdrawFundsFromCancelGame = async (req, res) => {
  const { tx } = req.body;
  // Ref: KN-P/clientproxy.js/ahbidnft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });
  // sdk confirm transactions
  // const response = await sdk.confirmTransactions(tx);

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  return res.send({ success: true });

  // ref: KN-P/ database.js / ah_prepare_new_bid

  // return {success: true / false}
};

exports.serializeClaimNftFromEndedGameTransaction = async function (req, res) {
  const { user_wallet, game_pda } = req.body;

  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });
  if (!game_pda) return res.send({ error_code: 'Wrong game pda' });

  // reference KN-P/ clientproxy / ahSerializeWithdrawFromWallet

  // steps:
  // get game_pda from bidders by user_wallet and game_pda
  // db.get_bid_info

  const onchain_game_data = await sdk.getGameInfo(game_pda);
  const finanlized_random_number = onchain_game_data.winnerRandomNumber;
  const bidders = await sdk.getGameBidList(user_wallet, game_pda);

  let is_winner = false;
  if (bidders && bidders.length > 0) {
    bidders.sort((a, b) => a.account.openedTimestamp - b.account.openedTimestamp);
    let start_index = 1;
    for (var i = 0; i < bidders.length; i++) {
      if (
        start_index <= finanlized_random_number[0] &&
        start_index +
          bidders[i].account.boughtTicketAmount +
          bidders[i].account.bonusTicketAmount +
          bidders[i].account.freelyTicketAmount -
          1 >=
          finanlized_random_number[0] &&
        user_wallet == bidders[i].account.userWallet.toString()
      ) {
        is_winner = true;
        break;
      }
      start_index =
        start_index +
        bidders[i].account.boughtTicketAmount +
        bidders[i].account.bonusTicketAmount +
        bidders[i].account.freelyTicketAmount;
    }
  }

  if (!is_winner) {
    return res.json({ error_code: 'This user is not winner.' });
  }

  const response = await sdk.serializeClaimNftFromEndedGameRPC(user_wallet, game_pda);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  return res.json({
    instruction: [...new Uint8Array(response)]
  });
  // call sdk and get tx
  // tx = sdkservice.serializeClaimNftFromEndedGameRPC(user_wallet, game_pda)

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.claimNftFromEndedGame = async (req, res) => {
  const { tx } = req.body;
  // Ref: KN-P/clientproxy.js/ahbidnft

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions
  // const response = await sdk.confirmTransactions(tx);

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  return res.send({ success: true });

  // ref: KN-P/ database.js / ah_prepare_new_bid

  // return {success: true / false}
};

exports.serializeStakeFreelyNftTransaction = async function (req, res) {
  const { user_wallet, nft_mint_address } = req.body;

  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });
  if (!nft_mint_address) return res.send({ error_code: 'Wrong nft mint address' });

  // reference KN-P/ clientproxy / ahSerializeWithdrawFromWallet

  // call sdk and get tx
  // tx = sdkservice.serializeStakeFreelyNftRPC(user_wallet, nft_mint_address)

  const response = await sdk.serializeStakeFreelyNftRPC(user_wallet, nft_mint_address);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });
  return res.json({
    instruction: [...new Uint8Array(response)]
  });

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.stakeFreelyNft = async (req, res) => {
  const { tx } = req.body;

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions
  // const response = await sdk.confirmTransactions(tx);

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: resporesponse.message.error ? response.message.error : response.message });

  return res.send({ success: true });

  // return {success: true / false}
};

exports.serializeUnstakeFreelyNftTransaction = async function (req, res) {
  const { user_wallet } = req.body;

  if (!user_wallet) return res.send({ error_code: 'Wrong wallet address' });
  // reference KN-P/ clientproxy / ahSerializeWithdrawFromWallet

  // call sdk and get tx
  // tx = sdkservice.serializeUnstakeFreelyNftRPC(user_wallet)

  const response = await sdk.serializeUnstakeFreelyNftRPC(user_wallet);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });
  return res.json({
    instruction: [...new Uint8Array(response)]
  });

  // return format
  // {
  //   tx: serializedTX
  // }
};

exports.unStakeFreelyNft = async (req, res) => {
  const { tx } = req.body;

  if (!tx) return res.send({ error_code: 'Wrong transaction.' });

  // sdk confirm transactions
  // const response = await sdk.confirmTransactions(tx);

  // errror handling
  // res.send({ error_code: response.message.error ? response.message.error : response.message });

  const response = await sdk.confirmTransactions(tx);

  if (response.message) return res.send({ error_code: response.message.error ? response.message.error : response.message });

  return res.send({ success: true });

  // return {success: true / false}
};

exports.getUserInfo = async (req, res) => {
  const { user_wallet } = req.body;
  const userPda = await sdk.findUserDetailsPdaAddress(user_wallet);
  const userInfo = await sdk.fetchUserDetails(userPda);
  return res.send({ userInfo });
};

exports.getBidInfo = async (req, res) => {
  const { user_wallet, pda_address } = req.body;

  if (!user_wallet) return res.send({ error_code: 'Wrong transaction.' });
  if (!pda_address) return res.send({ error_code: 'Wrong game address.' });

  const userBidInfo = await sdk.getBidList(user_wallet, pda_address);
  let is_refunded = false;
  if (userBidInfo && userBidInfo.length > 0) {
    for (let i = 0; i < userBidInfo.length; i++) {
      if (
        JSON.stringify(userBidInfo[i].account.fundsStatus) == JSON.stringify({ withdrawed: {} }) &&
        userBidInfo[i].account.bidNumber.toString() == '1'
      ) {
        is_refunded = true;
        break;
      }
    }
  }

  // get game_pda from bidders by user_wallet and pda_address
  db.get_game_pda(user_wallet, pda_address, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    return res.json({ result: rows, is_refunded });
  });
};

exports.getPurchaseHistoryPerGame = async (req, res) => {
  const { pda_address } = req.body;
  db.getPurchaseHistoryPerGame(pda_address, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err, result: [] });
    }
    return res.json({ result: rows });
  });
};

exports.generateDummyGames = async (req, res) => {
  let mintAddresses = [
    '2wsGRLqfoZ7hTGu4rymZuJRPBCZC3arYcwCTmSKG1RMY',
    'JS8NJHYAoiRrMMkGpkfxemWgw2pdpghNqW7366KFwGk',
    'Es1WtyKcQFhdJCZE9BZ6fpeiLktEJEYLQTtRphJj6XoW',
    '8RE9e77PEbR9QoYtQPQ6ha4j1qPrdd8M8uGWYAJd6qqB',
    'HyCThiJ95QCT65fPLedgBC4Usaryn4bGy9EaHZRXp6n2',
    '8QPWpeoMaHrrPuiexZwtJPf4PyfQPiXhUrvVKTppdU1Q',
    '2WU4RxGdptcFpog9nGojDQo7T2Rm3vzDKVu98Z9RQEet',
    '9XrGmqdEvsCGgTvfYpGeNrCzbupjkggqUxBvkXCp1Atq'
  ];
  let data = [];
  await Promise.all(
    mintAddresses.map(async (mintAddress) => {
      let metadataPDA = await Metadata.getPDA(new PublicKey(mintAddress));
      try {
        let tokenMetadata = await Metadata.load(connection, metadataPDA);
        let metadataExternal = (await axios.get(tokenMetadata.data.data.uri)).data;
        if (metadataExternal == null) return;

        let thumb = await imageThumbnail({ uri: metadataExternal.image }, { width: 200, responseType: 'base64' });

        let temp = {
          name: metadataExternal.name,
          image: metadataExternal.image,
          collection: metadataExternal.collection,
          thumb
        };

        data.push({ metadata: JSON.stringify(temp), mint: mintAddress });
      } catch (err) {
        return res.status(500).send({
          message: err
        });
      }
    })
  );
  db.updateDummyNftData(data, (err, rows) => {
    if (err) {
      return res.json({ error_code: err.errno });
    }
    return res.json({ result: rows });
  });
  res.json({ success: true });
};

exports.getNFTsbyWallet = async (req, res) => {
  const { wallet } = req.body;

  if (!wallet) res.json({ error_code: 'Wallet key string is empty.' });

  try {
    const owner = new web3.PublicKey(wallet);
    const tokens = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID
    });
    const result = tokens.value
      .filter((t) => {
        const amount = t.account.data.parsed.info.tokenAmount;
        return amount.decimals === 0 && amount.uiAmount === 1;
      })
      .map((t) => ({
        address: new PublicKey(t.pubkey),
        mint: new PublicKey(t.account.data.parsed.info.mint)
      }));
    res.json({ result });
  } catch (e) {
    res.json({ error_code: e });
  }
};

exports.getNotification = function (req, res) {
  const { wallet_address } = req.body;
  if (!wallet_address && wallet_address === '') return res.json({ error_code: 'Invalid wallet address' });

  db.get_notification(wallet_address, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    return res.json({ result: rows });
  });
};

exports.markNotificationAsRead = function (req, res) {
  const { wallet_address } = req.body;
  if (!wallet_address && wallet_address === '') return res.json({ error_code: 'Invalid wallet address' });

  db.mark_notification_as_read(wallet_address, (err, rows) => {
    if (err) {
      return res.json({ error_code: err.errno });
    }
    return res.json({ result: rows });
  });
};

async function getNftMetadata(nft_mint_address) {
  const connection = new web3.Connection(network, opts);

  let metadataPDA = await Metadata.getPDA(new web3.PublicKey(nft_mint_address));
  let tokenMetadata = await Metadata.load(connection, metadataPDA);

  //get thumbnail
  let thumb = null;
  let metadataExternal = null;
  if (tokenMetadata.data?.data?.uri) {
    metadataExternal = (await axios.get(tokenMetadata.data.data.uri)).data;
    if (metadataExternal == null) {
      return false;
    }
    thumb = await imageThumbnail({ uri: metadataExternal.image }, { width: 200, responseType: 'base64' });
  }

  return {
    nft_name: metadataExternal?.name,
    collection_name: metadataExternal?.collection?.name,
    nft_symbol: metadataExternal?.symbol,
    thumbnail: thumb
  };
}

async function getWingsNftType(nft_mint_address) {
  const connection = new web3.Connection(network, opts);

  let metadataPDA = await Metadata.getPDA(new web3.PublicKey(nft_mint_address));
  let tokenMetadata = await Metadata.load(connection, metadataPDA);

  let metadataExternal = (await axios.get(tokenMetadata.data.data.uri)).data;

  if (metadataExternal == null) {
    return false;
  }
  let type = '';
  metadataExternal.attributes.filter((el) => {
    if (el?.trait_type === 'Type') type = el?.value;
  });
  return type;
}

exports.getGameRanks = function (req, res) {
  const { pda_address } = req.body;
  db.get_game_ranks(pda_address, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    return res.json({ data: rows });
  });
};

exports.checkUserWhitelisted = async function (req, res) {
  const { user_wallet } = req.body;
  if (!user_wallet) return res.send({ error_code: 'Wrong user wallet' });

  db.check_user_whitelisted(user_wallet, async (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    const gameList = await sdk.fetchAllGamesByOrganizer(user_wallet);
    const game_time_stamp = await sdk.getCurrentBlockTime(user_wallet);
    let openedGame = 0;

    if (gameList && gameList.length > 0) {
      for (var i = 0; i < gameList.length; i++) {
        if (game_time_stamp < gameList[i].account.openedTimestamp + gameList[i].account.duration) {
          openedGame++;
        }
      }
    }

    return res.json({ is_whitelisted: rows.length > 0 ? true : false, is_game_created: openedGame > 0 ? true : false });
  });
};

exports.isWingsNftUsing = async function (req, res) {
  const { wings_nft, creator_wallet_address } = req.body;

  if (!wings_nft) {
    return res.json({ error_code: 'Invalid Wings NFT address.' });
  }

  let is_using = false;
  if (wings_nft) {
    const game_time_stamp = await sdk.getCurrentBlockTime(creator_wallet_address);
    const wingsGameList = await sdk.fetchGameListByWingsAddress(creator_wallet_address, wings_nft);
    if (wingsGameList && wingsGameList.length > 0) {
      for (let i = 0; i < wingsGameList.length; i++) {
        if (game_time_stamp < wingsGameList[i].account.openedTimestamp + wingsGameList[i].account.duration) {
          is_using = true;
          break;
        }
      }
    }
  }

  return res.json({ is_using });
};

exports.getMyLockedWings = async function (req, res) {
  const { user_wallet } = req.body;

  if (!user_wallet) {
    return res.json({ error_code: 'Wrong user wallet' });
  }

  const myWings = await sdk.fetchLockedWings(user_wallet);

  return res.json({ my_wings: myWings });
};

exports.getCountdownStatus = async function (req, res) {
  db.get_deadline_status((err, result) => {
    if (err) {
      return res.json({ result: false, error_code: err });
    }
    return res.json({ result: result });
  });
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

exports.getMyGameList = async function (req, res) {
  const { user_wallet, is_mine, is_bought } = req.body;

  if (!user_wallet) return res.json({ error_code: 'Wrong user wallet' });
  async.parallel(
    [db.get_my_game_list.bind(null, user_wallet, is_mine, is_bought), getMyGameListBySdk.bind(null, user_wallet)],
    async function (err, results) {
      if (err) {
        console.error(err);
        return res.send({ error_code: err.errno, db_error_code: err.code });
      }

      for (let i = 0; i < results[0].length; i++) {
        let is_owner = false;
        for (let j = 0; j < results[1].length; j++) {
          if (results[0][i].pda_address == results[1][j].publicKey.toString()) {
            if (results[0][i].status == 'closed') {
              if (user_wallet == results[1][j].account.nftOwnerWallet.toString()) {
                if (JSON.stringify(results[1][j].account.fundsStatus) == JSON.stringify({ withdrawed: {} })) {
                  results[0][i]['is_claimed'] = true;
                } else {
                  results[0][i]['is_claimed'] = false;
                }
                is_owner = true;
              } else {
                results[0][i]['is_claimed'] = true;
              }
              break;
            } else if (results[0][i].status == 'cancelled') {
              if (user_wallet == results[1][j].account.nftOwnerWallet.toString()) {
                if (results[1][j].account.isNftUnstaked == true) {
                  results[0][i]['is_claimed'] = true;
                } else {
                  results[0][i]['is_claimed'] = false;
                }
                is_owner = true;
              } else {
                results[0][i]['is_claimed'] = true;
              }
              break;
            }
          }
        }
        if(!is_owner) {
          if (results[0][i].status == 'closed') {
            let on_chain_data = await sdk.getGameInfo(results[0][i].pda_address);
            const gameBidList = await sdk.getGameBidList(results[0][i].pda_address, results[0][i].pda_address);
            const finanlized_random_number = on_chain_data.winnerRandomNumber;
            let winner = null;
            let is_claimed = false;
            if (gameBidList && gameBidList.length > 0) {
              gameBidList.sort((a, b) => a.account.openedTimestamp - b.account.openedTimestamp);
              let start_index = 1;
              for (let j = 0; j < gameBidList.length; j++) {
                if (
                  start_index <= finanlized_random_number[0] &&
                  start_index +
                    gameBidList[j].account.boughtTicketAmount +
                    gameBidList[j].account.bonusTicketAmount +
                    gameBidList[j].account.freelyTicketAmount -
                    1 >=
                    finanlized_random_number[0]
                ) {
                  winner = gameBidList[j].account.userWallet.toString();
                }

                start_index =
                  start_index +
                  gameBidList[j].account.boughtTicketAmount +
                  gameBidList[j].account.bonusTicketAmount +
                  gameBidList[j].account.freelyTicketAmount;

                if (gameBidList[j].account.bidNumber == 1 && gameBidList[j].account.winnerNftClaim == true && user_wallet == gameBidList[j].account.userWallet.toString()) {
                  is_claimed = true;
                }
              }
            }
            if(user_wallet == winner) {
              if(is_claimed) results[0][i]['is_claimed'] = true;
              else results[0][i]['is_claimed'] = false;
              results[0][i]['is_winner'] = true;
            } else {
              results[0][i]['is_winner'] = false;
              results[0][i]['is_claimed'] = true;
            }
          }
          else if (results[0][i].status == 'cancelled') {
            let is_refunded = false;
            const gameBidList = await sdk.getBidList(user_wallet, results[0][i].pda_address);
            for (let j = 0; j < gameBidList.length; j++) {
              if (gameBidList[j].account.bidNumber.toString() == '1') {
                if (JSON.stringify(gameBidList[j].account.fundsStatus) == JSON.stringify({ withdrawed: {} })) {
                  results[0][i]['is_claimed'] = true;
                  is_refunded = true;
                }
                break;
              }
            }
            if (!is_refunded) results[0][i]['is_claimed'] = false;
          }
        }
      }
      return res.json({ result: results[0] });
    }
  );
};

exports.getMyGameListThumbnails = function (req, res) {
  const { user_wallet, is_mine, is_bought, pg_size, pg_offset } = req.body;

  if (pg_offset === undefined || parseInt(pg_offset) < 0 || !pg_size || parseInt(pg_size) == 0) {
    return res.send({ error_code: 'Wrong pagination' });
  }

  db.get_my_game_list_thumbnails(user_wallet, is_mine, is_bought, pg_size, pg_offset, (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ error_code: err.errno });
    }
    return res.json({ result: rows });
  });
};

async function getMyGameListBySdk(user_wallet, callback) {
  const gameList = await sdk.fetchAllGamesByOrganizer(user_wallet);
  return callback(null, gameList);
}
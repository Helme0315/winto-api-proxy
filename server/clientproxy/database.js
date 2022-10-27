const { Pool } = require('pg');
const HTMLDecoderEncoder = require('html-encoder-decoder');

const readonlyPool = new Pool({
  host: process.env.NODE_PSQL_HOST,
  port: process.env.NODE_PSQL_PORT,
  database: process.env.NODE_PSQL_DBNAME,
  user: process.env.NODE_PSQL_READONLY_USER,
  password: process.env.NODE_PSQL_READONLY_PWD,
  poolSize: 10
});

const writablePool = new Pool({
  host: process.env.NODE_PSQL_HOST,
  port: process.env.NODE_PSQL_PORT,
  database: process.env.NODE_PSQL_DBNAME,
  user: process.env.NODE_PSQL_WRITABLE_USER,
  password: process.env.NODE_PSQL_WRITABLE_PWD,
  poolSize: 10
});

async function read_query(query, params, callback) {
  readonlyPool.query(query, params, (err, data) => {
    callback(err, data);
  });
}

async function write_query(query, params, callback) {
  writablePool.query(query, params, (err, data) => {
    callback(err, data);
  });
}
exports.read_query = read_query;
exports.write_query = write_query;

exports.get_game_list = function (type, status, user_wallet, is_mine, is_bought, search, coin_type, callback) {
  const thumb_limit = 4;
  // const thumb_limit = process.env.NODE_FIRST_THUMBNAIL_AMOUNT || 8;

  let queryMain = `
  SELECT
    games.id AS id,
    games.created_date as created_date,
    games.coin_type AS coin_type,
    games.created_date + interval '1 second' * games.duration::decimal as ends_time,
    games.game_type AS game_type,
    games.nft_mint_address::JSONB->0  AS nft_mint_address,
    games.nft_metadata->0->>'nft_name' AS nft_name,
    games.nft_metadata->0->>'nft_symbol' AS nft_symbol,
    games.creator_wallet_address,
    games.pda_address,
    games.is_processed as is_processed,
    CASE WHEN
      CAST(now() as timestamp without time zone) >= games.created_date + interval '1 second' * games.duration::decimal
        THEN (
          CASE WHEN games.minimum_cost::decimal <= games.ticket_price::decimal *  (CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
            THEN 0
            ELSE SUM(bidders.ticket_amount::decimal)
          END)
        THEN 'closed'
        ELSE 'cancelled'
      END)
      ELSE 'open'
    END AS status,
    CEIL(games.minimum_cost::decimal / games.ticket_price::decimal) as target_tickets,
    games.minimum_cost::decimal as target_price,
    games.ticket_price AS ticket_price,
    games.nft_metadata->0->>'thumbnail' AS thumbnail,

  `;

  let userQuery = '';
  if (type !== 'my_games' && user_wallet) {
    userQuery = `
        CASE WHEN games.creator_wallet_address = '${user_wallet}' THEN true ELSE false END AS is_mine,
        CASE WHEN SUM(CASE WHEN bidders.user_wallet_address = '${user_wallet}' THEN bidders.ticket_amount::decimal ELSE 0 END) != 0
          THEN true
          ELSE false
        END as is_bought,
    `;
  } else {
    userQuery = ` false AS is_mine,  false AS is_bought,  `;
  }

  userQuery += `
    CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
      THEN 0
      ELSE SUM(bidders.ticket_amount::decimal)
    END as current_ticket_sales
    FROM games  LEFT JOIN bidders as bidders ON bidders.game_id = games.id and bidders.is_processed = true GROUP BY games.id `;

  let whereClause = 'WHERE games_list.is_processed = true ';
  if (type != 'all' && type !== 'my_games') {
    if (type) {
      whereClause += ` AND games_list.game_type = '${type}'`;
    } else if (!type) {
      whereClause += ` AND games_list.game_type IS NULL`;
    }
  }

  if (type === 'my_games' && user_wallet) {
    whereClause += ` AND games_list.creator_wallet_address = '${user_wallet}' `;
  }

  if (status) {
    whereClause += ` AND games_list.status = '${status}'`;
  }

  if (is_mine) {
    whereClause += ` AND games_list.is_mine = '${is_mine}'`;
  }

  if (is_bought) {
    whereClause += ` AND games_list.is_bought = '${is_bought}'`;
  }

  if (search) {
    whereClause += ` AND (games_list.nft_mint_address  LIKE '%' || '${search}' || '%' OR games_list.nft_metadata->'metadataExternal'->>'name' LIKE '%' || '${search}' || '%')`;
  }

  if (coin_type != 'all') {
    whereClause += ` AND games_list.coin_type = '${coin_type}'`;
  }

  const selectQuery = `
  SELECT games_list.id,
    games_list.created_date,
    games_list.coin_type,
    games_list.ends_time,
    games_list.game_type,
    games_list.nft_mint_address,
    games_list.nft_name,
    games_list.nft_symbol,
    games_list.status,
    games_list.target_tickets,
    games_list.thumbnail,
    games_list.ticket_price,
    games_list.target_price,
    games_list.is_bought,
    games_list.is_mine,
    games_list.is_processed,
    games_list.creator_wallet_address,
    games_list.pda_address,
    CASE WHEN row_number() over(ORDER BY games_list.status DESC, games_list.created_date DESC, games_list.id DESC) > ${thumb_limit}
      THEN NULL
      ELSE games_list.thumbnail END as thumbnail,
    games_list.current_ticket_sales
  FROM (${queryMain} ${userQuery} )
  as games_list
  ${whereClause}
   ORDER BY games_list.status DESC, games_list.created_date DESC, games_list.id DESC;`;

  read_query(selectQuery, [], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

exports.get_game_list_thumbnails = function (
  type,
  status,
  user_wallet,
  is_mine,
  is_bought,
  search,
  coin_type,
  pg_size,
  pg_offset,
  callback
) {
  let queryMain = `
  SELECT
    games.id AS id,
    games.created_date as created_date,
    games.coin_type AS coin_type,
    games.created_date + interval '1 second' * games.duration::decimal as ends_time,
    games.game_type AS game_type,
    games.nft_mint_address::JSONB  AS nft_mint_address,
    games.nft_metadata->'name' AS nft_name,
    games.nft_metadata->'metadataExternal'->>'symbol' AS nft_symbol,
    games.is_processed as is_processed,
    CASE WHEN
      CAST(now() as timestamp without time zone) >= games.created_date + interval '1 second' * games.duration::decimal
        THEN (
          CASE WHEN games.minimum_cost::decimal <= games.ticket_price::decimal *  (CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
            THEN 0
            ELSE SUM(bidders.ticket_amount::decimal)
          END)
        THEN 'closed'
        ELSE 'cancelled'
      END)
      ELSE 'open'
    END AS status,
    CEIL(games.minimum_cost::decimal / games.ticket_price::decimal) as target_tickets,
    games.minimum_cost::decimal as target_price,
    games.ticket_price AS ticket_price,
    games.nft_metadata->0->>'thumbnail' AS thumbnail,

  `;

  let userQuery = '';
  if (user_wallet) {
    userQuery = `
        CASE WHEN games.creator_wallet_address = '${user_wallet}' THEN true ELSE false END AS is_mine,
        CASE WHEN SUM(CASE WHEN bidders.user_wallet_address = '${user_wallet}' THEN bidders.ticket_amount::decimal ELSE 0 END) != 0
          THEN true
          ELSE false
        END as is_bought,
    `;
  } else {
    userQuery = ` false AS is_mine,  false AS is_bought,  `;
  }

  userQuery += `
    CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
      THEN 0
      ELSE SUM(bidders.ticket_amount::decimal)
    END as current_ticket_sales
    FROM games  LEFT JOIN bidders as bidders ON bidders.game_id = games.id and bidders.is_processed = true GROUP BY games.id `;

  let whereClause = 'WHERE games_list.is_processed = true ';
  if (type != 'all') {
    if (type) {
      whereClause += ` AND games_list.game_type = '${type}'`;
    } else if (!type) {
      whereClause += ` AND games_list.game_type IS NULL`;
    }
  }

  if (status) {
    whereClause += ` AND games_list.status = '${status}'`;
  }

  if (is_mine) {
    whereClause += ` AND games_list.is_mine = '${is_mine}'`;
  }

  if (is_bought) {
    whereClause += ` AND games_list.is_bought = '${is_bought}'`;
  }

  if (search) {
    whereClause += ` AND (games_list.nft_mint_address  LIKE '%' || '${search}' || '%' OR games_list.nft_metadata->'metadataExternal'->>'name' LIKE '%' || '${search}' || '%')`;
  }

  if (coin_type != 'all') {
    whereClause += ` AND games_list.coin_type = '${coin_type}'`;
  }

  const selectQuery = `
  SELECT games_list.id,
    games_list.thumbnail as thumbnail,
    games_list.created_date,
    games_list.status
  FROM (${queryMain} ${userQuery} )
  as games_list
  ${whereClause}
   ORDER BY games_list.status DESC, games_list.created_date DESC, games_list.id DESC  LIMIT ${pg_size} OFFSET ${pg_offset};`;

  read_query(selectQuery, [], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

exports.get_game_detail = function (pda_address, wallet_address, callback) {
  // code reference:
  let queryMain = `SELECT games.id,
    games.created_date,
    games.creator_wallet_address,
    games.nft_mint_address::JSONB->0 as nft_mint_address,
    CASE WHEN
      CAST(now() as timestamp without time zone) >= games.created_date + interval '1 second' * games.duration::decimal
        THEN (
          CASE WHEN games.minimum_cost::decimal <= games.ticket_price::decimal *  (CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
            THEN 0
            ELSE SUM(bidders.ticket_amount::decimal)
          END)
        THEN 'closed'
        ELSE 'cancelled'
      END)
      ELSE 'open'
    END as status,

    games.created_date + interval '1 second' * games.duration::decimal as ends_time,
    games.coin_type,
    games.duration,
    games.minimum_cost,
    games.ticket_price,
    games.pda_address,
    CEIL(games.minimum_cost::decimal / games.ticket_price::decimal) as target_tickets,
    games.minimum_cost::decimal as target_price,
    games.game_type,
    games.nft_metadata->0->>'nft_name' AS nft_name,
    games.nft_metadata->0->>'nft_symbol' AS nft_symbol,
    games.nft_metadata->0->>'thumbnail' AS thumbnail,
    `;

  let userQuery = '';
  if (wallet_address) {
    userQuery = `
        CASE WHEN games.creator_wallet_address = '${wallet_address}' THEN true ELSE false END AS is_mine,
        SUM(CASE WHEN bidders.user_wallet_address = '${wallet_address}' THEN bidders.ticket_amount::decimal ELSE 0 END) as current_bought_tickets,
        CASE WHEN SUM(CASE WHEN bidders.user_wallet_address = '${wallet_address}' THEN bidders.ticket_amount::decimal ELSE 0 END) != 0
          THEN true
          ELSE false
        END as is_bought

    `;
  } else {
    userQuery = ` false AS is_mine,  false AS is_bought  `;
  }

  userQuery += `,
  CASE WHEN
    SUM(bidders.ticket_amount::decimal) IS NULL THEN 0 ELSE SUM(bidders.ticket_amount::decimal) END
    as current_ticket_sales
    FROM games AS games  LEFT JOIN bidders as bidders ON bidders.game_id = games.id and bidders.is_processed = true  `;

  let whereClause = `WHERE games.pda_address = $1 and games.is_processed = true `;

  read_query(`${queryMain} ${userQuery} ${whereClause} GROUP BY games.id LIMIT 1;`, [pda_address], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows[0]);
  });
};

exports.prepare_new_game = (
  pda_adress,
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
  is_exist,
  callback
) => {
  let queryString = '';
  if (is_exist == 0) {
    queryString = `
      WITH whitelist_proof AS (
        SELECT wallet_address, proof FROM organizer_whitelist WHERE wallet_address = $2
      ),
      insert_game As (
          INSERT INTO games (
            pda_address,
            creator_wallet_address,
            created_date,
            coin_type,
            ticket_price,
            duration,
            minimum_cost,
            nft_metadata,
            game_type,
            nft_mint_address,
            is_processed,
            wings_nft_address
          )
          VALUES ($1, $2, to_timestamp($3), $4, $5, $6, $7, $8::JSONB, $9, $10::JSONB, false, $11)
          RETURNING id, creator_wallet_address
        )
        SELECT id, proof FROM insert_game LEFT JOIN whitelist_proof ON insert_game.creator_wallet_address = whitelist_proof.wallet_address
    `;
  } else {
    queryString = `
      WITH whitelist_proof AS (
        SELECT wallet_address, proof FROM organizer_whitelist WHERE wallet_address = $2
      ),
      update_game As (
          UPDATE games SET
            pda_address=$1,
            created_date=to_timestamp($3),
            coin_type=$4,
            ticket_price=$5,
            duration=$6,
            minimum_cost=$7,
            nft_metadata=$8,
            game_type=$9,
            is_processed=false,
            wings_nft_address=$11
          where creator_wallet_address = $2 and nft_mint_address = $10 and is_processed = false
          RETURNING id, creator_wallet_address
        )
        SELECT id, proof FROM update_game LEFT JOIN whitelist_proof ON update_game.creator_wallet_address = whitelist_proof.wallet_address
    `;
  }

  write_query(
    queryString,
    [
      pda_adress,
      creator_wallet_address,
      game_time_stamp,
      coin_type,
      ticket_price,
      duration,
      minimum_cost,
      JSON.stringify(nft_metadata_list),
      game_type,
      JSON.stringify(nft_mint_address_list),
      wings_nft_mint
    ],
    function (err_nd, result) {
      if (err_nd) {
        console.log('DB Error: ', err_nd.toString());
        return callback(err_nd);
      }
      return callback(null, result.rows);
    }
  );
};

exports.create_new_game = function (gameID, organizer_wallet_address, callback) {
  const queryString = `
      UPDATE games SET is_processed = true
      WHERE id = $1 AND creator_wallet_address = $2
  `;
  write_query(queryString, [gameID, organizer_wallet_address], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null);
  });
};

exports.process_new_bid = function (bid_id, callback) {
  // ref: KN-P/ database.js / ah_prepare_new_bid
  // update bidders table is_processed
  const queryString = `
      UPDATE bidders SET is_processed = true
      WHERE id = $1
  `;
  write_query(queryString, [bid_id], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null);
  });
};

/// this is old code, will pick or remove later

exports.check_user_whitelisted = (wallet_address, callback) => {
  let sqlString = `SELECT * FROM organizer_whitelist WHERE wallet_address='${wallet_address}';`;
  read_query(sqlString, [], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null, result.rows);
  });
};

exports.buyTickets = ({ game_id, ticket_amount, user_wallet_address }, callback) => {
  const queryString = `INSERT INTO bidders (game_id, ticket_amount, user_wallet_address, game_pda_address)
    VALUES ('${game_id}', '${ticket_amount}', '${user_wallet_address}', (SELECT pda_address FROM games WHERE id = ${game_id})
  ) RETURNING id;`;

  write_query(queryString, [], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null, result.rows);
  });
};

exports.forceToStartGame = ({ game_id }, callback) => {
  const queryString = `UPDATE games SET status = 'closed' WHERE id=${game_id}`;

  write_query(queryString, [], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null, result.rows);
  });
};

exports.getPurchaseHistoryPerGame = (pda_address, callback) => {
  let sqlString = `SELECT bidders.created_date, bidders.ticket_amount, bidders.user_wallet_address,
    (games.ticket_price::decimal * bidders.ticket_amount::integer) as paid_amount, games.coin_type as coin_type, bidders.bonus_ticket_amount
    FROM bidders
    LEFT JOIN games ON bidders.game_pda_address = games.pda_address
    WHERE bidders.game_pda_address=$1 AND bidders.is_processed = true
    ORDER BY bidders.id ASC;`;
  read_query(sqlString, [pda_address], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null, result.rows);
  });
};

exports.updateDummyNftData = (data, callback) => {
  let sqlString = `SELECT * FROM games;`;
  read_query(sqlString, [], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    if (result.rows.length) {
      result.rows.map((eachRow, index) => {
        const dataRow = data[index % data.length];
        const updateQuery = `UPDATE games SET nft_mint_address = jsonb_set(${dataRow.mint}) WHERE id=${eachRow.id};`;

        write_query(updateQuery, [], function (err, result) {
          // console.log('err :>> ', err);
        });
      });
    }
  });
};

exports.get_notification = (wallet_address, callback) => {
  const queryString = `SELECT wallet_address, notification FROM notifications WHERE (wallet_address=$1 OR wallet_address='1111111111' OR wallet_address='2222222222') AND read_status=false;`;
  read_query(queryString, [wallet_address], function (err_nd, data) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    if (data.rows.length) {
      data.rows.map((row) => (row.notification = HTMLDecoderEncoder.decode(row.notification)));
    }
    return callback(err_nd, data.rows);
  });
};

exports.mark_notification_as_read = (wallet_address, callback) => {
  if (wallet_address === '1111111111') return;
  const queryString = `
    UPDATE notifications SET read_status=true
    WHERE wallet_address = $1;
  `;

  write_query(queryString, [wallet_address], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(err_nd, result.rows);
  });
};

exports.get_game_pda = (user_wallet, pda_address, callback) => {
  // code reference:

  let queryMain = `SELECT * FROM bidders where game_pda_address = $1 and user_wallet_address = $2 and is_processed = true `;

  read_query(`${queryMain};`, [pda_address, user_wallet], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

exports.get_game_info = (pda_address, callback) => {
  // code reference:

  let queryMain = `SELECT
        games.*,
        CASE WHEN
          CAST(now() as timestamp without time zone) >= games.created_date + interval '1 second' * games.duration::decimal
            THEN (
              CASE WHEN games.minimum_cost::decimal <= games.ticket_price::decimal *  (CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
                THEN 0
                ELSE SUM(bidders.ticket_amount::decimal)
              END)
            THEN 'closed'
            ELSE 'cancelled'
          END)
          ELSE 'open'
        END as status
    FROM games
    LEFT JOIN bidders ON bidders.game_pda_address = games.pda_address and bidders.is_processed = true
    WHERE games.pda_address = $1 and games.is_processed = true
    GROUP BY games.id `;

  read_query(`${queryMain};`, [pda_address], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    if (data.rowCount == 0) return callback(null, false);
    return callback(null, data.rows[0]);
  });
};

exports.get_bidders_from_game_id = (game_id, callback) => {
  let queryMain = `SELECT * FROM bidders where game_id = $1 and is_processed = true `;

  read_query(`${queryMain};`, [game_id], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

exports.get_game_ranks = (pda_address, callback) => {
  let queryMain = `SELECT SUM(ticket_amount::integer) as total, SUM(bonus_ticket_amount::integer) as bonus, user_wallet_address
    FROM bidders where game_pda_address = $1 and is_processed = true
    GROUP BY user_wallet_address
    ORDER BY total DESC;`;

  read_query(`${queryMain};`, [pda_address], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

exports.prepare_new_buy = (
  game_id,
  current_time_stamp,
  ticket_amount,
  bonus_ticket_amount,
  user_wallet_address,
  game_pda_address,
  callback
) => {
  const queryString = `
    INSERT INTO bidders (
      game_id,
      created_date,
      ticket_amount,
      bonus_ticket_amount,
      user_wallet_address,
      game_pda_address,
      is_processed
    )
    VALUES ($1, to_timestamp($2), $3, $4, $5, $6, false)
    RETURNING id
  `;

  write_query(
    queryString,
    [game_id, current_time_stamp, ticket_amount, bonus_ticket_amount, user_wallet_address, game_pda_address],
    function (err_nd, result) {
      if (err_nd) {
        return callback(err_nd);
      }
      return callback(null, result.rows);
    }
  );
};

exports.update_by_end_game = function (gameID, duration, minimum_cost, creator, callback) {
  const queryString = `
      UPDATE games SET duration = $2, minimum_cost = $3
      WHERE id = $1 AND creator_wallet_address = $4
  `;
  write_query(queryString, [gameID, duration, minimum_cost, creator], function (err_nd, result) {
    if (err_nd) {
      console.log('DB Error: ', err_nd.toString());
      return callback(err_nd);
    }
    return callback(null);
  });
};

exports.check_game_exist = (creator, nft_mint_address, callback) => {
  return new Promise((resolve, reject) => {
    let queryMain = `SELECT COUNT(id) as id FROM games where creator_wallet_address = $1 and nft_mint_address = $2 and is_processed = false`;
    read_query(`${queryMain};`, [creator, nft_mint_address], function (err, data) {
      if (err) reject(err);
      resolve(data.rows[0]);
    });
  });
};

exports.get_game_details = (pda_address, user_wallet, callback) => {
  return new Promise((resolve, reject) => {
    let queryMain = `SELECT * from games where pda_address = $1 and creator_wallet_address = $2 and is_processed = true`;
    read_query(`${queryMain};`, [pda_address, user_wallet], function (err, data) {
      if (err) reject(err);
      resolve(data.rows[0]);
    });
  });
};

exports.get_deadline_status = (callback) => {
  let queryMain = `SELECT field_value from settings where field_key= 'count_enabled';`;
  read_query(`${queryMain};`, [], function (err, data) {
    if (err) {
      return callback(err);
    }
    if (data.rows && data.rows.length) {
      if (data.rows[0].field_value === 'false') {
        return callback(null, [
          { field_key: 'count_enabled', field_value: 'false' },
          { field_key: 'count_deadline', field_value: '' },
          { field_key: 'admin_wallets', field_value: '' }
        ]);
      } else {
        let queryMain = `SELECT field_key, field_value from settings where field_key = 'count_deadline' OR field_key= 'count_enabled' OR field_key='admin_wallets';`;
        read_query(`${queryMain};`, [], function (err, data) {
          if (err) {
            return callback(err);
          }

          if (data.rows.length) {
            const countEnabled = data.rows.find((el) => el.field_key === 'count_enabled' && el.field_vaule === 'false');
            if (countEnabled) {
              return callback(null, []);
            }
            const currentTimestamp = new Date().getTime() / 1000;

            const countPassed = data.rows.find(
              (el) => el.field_key === 'count_deadline' && Number(el.field_value) < currentTimestamp
            );

            if (countPassed) {
              return callback(null, []);
            }
          }

          return callback(null, data.rows);
        });
      }
    } else {
      return callback(null, []);
    }
  });
};

exports.get_my_game_list = function (user_wallet, is_mine, is_bought, callback) {
  const thumb_limit = 4;

  let queryMain = `
  SELECT
    games.id AS id,
    games.created_date as created_date,
    games.coin_type AS coin_type,
    games.created_date + interval '1 second' * games.duration::decimal as ends_time,
    games.game_type AS game_type,
    games.nft_mint_address::JSONB->0  AS nft_mint_address,
    games.nft_metadata->0->>'nft_name' AS nft_name,
    games.nft_metadata->0->>'nft_symbol' AS nft_symbol,
    games.creator_wallet_address,
    games.pda_address,
    games.is_processed as is_processed,
    CASE WHEN
      CAST(now() as timestamp without time zone) >= games.created_date + interval '1 second' * games.duration::decimal
        THEN (
          CASE WHEN games.minimum_cost::decimal <= games.ticket_price::decimal *  (CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
            THEN 0
            ELSE SUM(bidders.ticket_amount::decimal)
          END)
        THEN 'closed'
        ELSE 'cancelled'
      END)
      ELSE 'open'
    END AS status,
    CEIL(games.minimum_cost::decimal / games.ticket_price::decimal) as target_tickets,
    games.minimum_cost::decimal as target_price,
    games.ticket_price AS ticket_price,
    games.nft_metadata->0->>'thumbnail' AS thumbnail,

  `;

  let userQuery = '';

  userQuery = `
      CASE WHEN games.creator_wallet_address = '${user_wallet}' THEN true ELSE false END AS is_mine,
      CASE WHEN SUM(CASE WHEN bidders.user_wallet_address = '${user_wallet}' THEN bidders.ticket_amount::decimal ELSE 0 END) != 0
        THEN true
        ELSE false
      END as is_bought,
  `;

  userQuery += `
    CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
      THEN 0
      ELSE SUM(bidders.ticket_amount::decimal)
    END as current_ticket_sales
    FROM games  LEFT JOIN bidders as bidders ON bidders.game_id = games.id and bidders.is_processed = true GROUP BY games.id `;

  let whereClause = 'WHERE games_list.is_processed = true ';

  if (is_mine) {
    whereClause += ` AND games_list.is_mine = '${is_mine}'`;
  }

  if (is_bought) {
    whereClause += ` AND games_list.is_bought = '${is_bought}'`;
  }

  if (!is_mine & !is_bought) {
    whereClause += ` AND (games_list.is_bought = '${!is_bought}' or games_list.is_mine = '${!is_mine}')`;
  }

  const selectQuery = `
  SELECT games_list.id,
    games_list.created_date,
    games_list.coin_type,
    games_list.ends_time,
    games_list.game_type,
    games_list.nft_mint_address,
    games_list.nft_name,
    games_list.nft_symbol,
    games_list.status,
    games_list.target_tickets,
    games_list.thumbnail,
    games_list.ticket_price,
    games_list.target_price,
    games_list.is_bought,
    games_list.is_mine,
    games_list.is_processed,
    games_list.creator_wallet_address,
    games_list.pda_address,
    CASE WHEN row_number() over(ORDER BY games_list.status DESC, games_list.created_date DESC, games_list.id DESC) > ${thumb_limit}
      THEN NULL
      ELSE games_list.thumbnail END as thumbnail,
    games_list.current_ticket_sales
  FROM (${queryMain} ${userQuery} )
  as games_list
  ${whereClause}
   ORDER BY games_list.status DESC, games_list.created_date DESC, games_list.id DESC;`;

  read_query(selectQuery, [], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

exports.get_my_game_list_thumbnails = function (user_wallet, is_mine, is_bought, pg_size, pg_offset, callback) {
  let queryMain = `
  SELECT
    games.id AS id,
    games.created_date as created_date,
    games.coin_type AS coin_type,
    games.created_date + interval '1 second' * games.duration::decimal as ends_time,
    games.game_type AS game_type,
    games.nft_mint_address::JSONB  AS nft_mint_address,
    games.nft_metadata->'name' AS nft_name,
    games.nft_metadata->'metadataExternal'->>'symbol' AS nft_symbol,
    games.is_processed as is_processed,
    games.creator_wallet_address,
    CASE WHEN
      CAST(now() as timestamp without time zone) >= games.created_date + interval '1 second' * games.duration::decimal
        THEN (
          CASE WHEN games.minimum_cost::decimal <= games.ticket_price::decimal *  (CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
            THEN 0
            ELSE SUM(bidders.ticket_amount::decimal)
          END)
        THEN 'closed'
        ELSE 'cancelled'
      END)
      ELSE 'open'
    END AS status,
    CEIL(games.minimum_cost::decimal / games.ticket_price::decimal) as target_tickets,
    games.minimum_cost::decimal as target_price,
    games.ticket_price AS ticket_price,
    games.nft_metadata->0->>'thumbnail' AS thumbnail,

  `;

  userQuery = `
      CASE WHEN games.creator_wallet_address = '${user_wallet}' THEN true ELSE false END AS is_mine,
      CASE WHEN SUM(CASE WHEN bidders.user_wallet_address = '${user_wallet}' THEN bidders.ticket_amount::decimal ELSE 0 END) != 0
        THEN true
        ELSE false
      END as is_bought,
  `;

  userQuery += `
    CASE WHEN SUM(bidders.ticket_amount::decimal) IS NULL
      THEN 0
      ELSE SUM(bidders.ticket_amount::decimal)
    END as current_ticket_sales
    FROM games  LEFT JOIN bidders as bidders ON bidders.game_id = games.id and bidders.is_processed = true GROUP BY games.id `;

  let whereClause = 'WHERE games_list.is_processed = true ';

  if (is_mine) {
    whereClause += ` AND games_list.is_mine = '${is_mine}'`;
  }

  if (is_bought) {
    whereClause += ` AND games_list.is_bought = '${is_bought}'`;
  }

  if (!is_mine & !is_bought) {
    whereClause += ` AND (games_list.is_bought = '${!is_bought}' or games_list.is_mine = '${!is_mine}')`;
  }

  const selectQuery = `
  SELECT games_list.id,
    games_list.thumbnail as thumbnail,
    games_list.created_date,
    games_list.status
  FROM (${queryMain} ${userQuery} )
  as games_list
  ${whereClause}
   ORDER BY games_list.status DESC, games_list.created_date DESC, games_list.id DESC  LIMIT ${pg_size} OFFSET ${pg_offset};`;

  read_query(selectQuery, [], function (err, data) {
    if (err) {
      console.log('DB Error: ', err.toString());
      return callback(err);
    }
    return callback(null, data.rows);
  });
};

use actix_web::{web, HttpRequest, Responder};

use actix_web::web::Json;

use core::cmp::min;

use super::{errors::RpcError, state::AppState};
use crate::types::Trade;
fn check_market_exists(_market: &str) -> bool {
    // TODO
    true
}
pub async fn recent_trades(req: HttpRequest, _data: web::Data<AppState>) -> impl Responder {
    let market = req.match_info().get("market").unwrap();
    let limit = min(100, req.match_info().query("limit").parse::<usize>().unwrap_or(20));
    if !check_market_exists(market) {
        return Err(RpcError::bad_request("invalid market"));
    }
    // TODO: check market valid
    // TODO: finish this after kline is done.
    // models::TradeHistory is more user-centric,
    // it is designed for a user to fetch his trades.
    // while the kline trade table is more market-centric, which is more suitable for fetching latest trades on a market

    let trade_table = "";
    let _sql_query = format!(
        "select * from {} where market = {} order by id desc limit {}",
        trade_table, market, limit
    );
    /*
    let trades: Vec<Trade> = sqlx::query_as(&sql_query)
        .fetch_all(&data.db)
        .await?;
    */
    let trades = Vec::<Trade>::new();
    Ok(Json(trades))
}

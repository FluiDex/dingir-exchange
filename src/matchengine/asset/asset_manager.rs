use crate::config;
use crate::market::OrderCommitment;
use crate::matchengine::rpc::*;
use crate::primitives::*;
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Eq, Hash)]
pub struct AssetInfo {
    pub prec_save: u32,
    pub prec_show: u32,
    pub inner_id: u32,
}

#[derive(Clone)]
pub struct AssetManager {
    pub assets: HashMap<String, AssetInfo>,
}

impl AssetManager {
    pub fn new(asset_config: &[config::Asset]) -> Result<AssetManager> {
        log::info!("asset {:?}", asset_config);
        let mut assets = HashMap::new();
        for item in asset_config.iter() {
            assets.insert(
                item.id.clone(),
                AssetInfo {
                    prec_save: item.prec_save,
                    prec_show: item.prec_show,
                    inner_id: item.rollup_token_id as u32,
                },
            );
        }
        Ok(AssetManager { assets })
    }

    pub fn append(&mut self, asset_config: &[config::Asset]) {
        //log::info()
        for item in asset_config.iter() {
            let ret = self.assets.insert(
                item.id.clone(),
                AssetInfo {
                    prec_save: item.prec_save,
                    prec_show: item.prec_show,
                    inner_id: item.rollup_token_id as u32,
                },
            );
            if ret.is_some() {
                log::info!("Update asset {}", item.id);
            } else {
                log::info!("Append new asset {}", item.id);
            }
        }
    }

    pub fn asset_exist(&self, id: &str) -> bool {
        self.assets.contains_key(id)
    }
    pub fn asset_get(&self, id: &str) -> Option<&AssetInfo> {
        self.assets.get(id)
    }
    pub fn asset_prec(&self, id: &str) -> u32 {
        self.asset_get(id).unwrap().prec_save
    }
    pub fn asset_prec_show(&self, id: &str) -> u32 {
        self.asset_get(id).unwrap().prec_show
    }

    pub fn commit_order(&self, o: &OrderPutRequest) -> Result<OrderCommitment> {
        let assets: Vec<&str> = o.market.split('_').collect();
        if assets.len() != 2 {
            bail!("market error");
        }
        let base_token = match self.asset_get(assets[0]) {
            Some(token) => token,
            None => bail!("market base_token error"),
        };
        let quote_token = match self.asset_get(assets[1]) {
            Some(token) => token,
            None => bail!("market quote_token error"),
        };
        let amount = match rust_decimal::Decimal::from_str(&o.amount) {
            Ok(d) => d,
            _ => bail!("amount error"),
        };
        let price = match rust_decimal::Decimal::from_str(&o.price) {
            Ok(d) => d,
            _ => bail!("price error"),
        };

        match OrderSide::from_i32(o.order_side) {
            Some(OrderSide::Ask) => Ok(OrderCommitment {
                token_buy: u32_to_fr(quote_token.inner_id),
                token_sell: u32_to_fr(base_token.inner_id),
                total_buy: decimal_to_fr(&(amount * price), quote_token.prec_save),
                total_sell: decimal_to_fr(&amount, base_token.prec_save),
            }),
            Some(OrderSide::Bid) => Ok(OrderCommitment {
                token_buy: u32_to_fr(base_token.inner_id),
                token_sell: u32_to_fr(quote_token.inner_id),
                total_buy: decimal_to_fr(&amount, base_token.prec_save),
                total_sell: decimal_to_fr(&(amount * price), quote_token.prec_save),
            }),
            None => bail!("market error"),
        }
    }
}

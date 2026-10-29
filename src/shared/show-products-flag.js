// shared/show-products-flag.js — opt-in display of reaction PRODUCT rows
// in the Samples panel and the print flows.

import { createBooleanFlag } from "./boolean-flag.js";

export const SHOW_PRODUCTS_STORAGE_KEY = "cddShowProducts";

const flag = createBooleanFlag(SHOW_PRODUCTS_STORAGE_KEY, false);

export const getShowProducts = flag.get;
export const saveShowProducts = flag.save;
export const isShowProductsEnabled = flag.isEnabled;
export const onShowProductsChanged = flag.onChanged;
export const initShowProducts = flag.init;

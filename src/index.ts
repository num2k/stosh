import { Stosh } from "./main";
import { StoshOptions } from "./types";

function stosh<T = any>(options?: StoshOptions): Stosh<T> {
  return new Stosh(options);
}
stosh.isSSR = Stosh.isSSR;

export { stosh, Stosh };

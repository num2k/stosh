import { Stosh } from "./main";
import { StoshOptions } from "./types";

function stosh(options?: StoshOptions) {
  return new Stosh(options);
}
stosh.isSSR = Stosh.isSSR;

export { stosh, Stosh };

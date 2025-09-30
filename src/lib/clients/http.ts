import { ofetch } from "ofetch";

export const http = ofetch.create({ timeout: 20_000 });

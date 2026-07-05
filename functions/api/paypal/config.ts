import { json, type Ctx } from "../_utils";
import { paypalConfigured } from "./_paypal";

// GET -> is PayPal checkout available + the public client id for the JS SDK.

export const onRequestGet = async (ctx: Ctx) =>
  json(
    paypalConfigured(ctx.env)
      ? {
          configured: true,
          clientId: ctx.env.PAYPAL_CLIENT_ID,
          env: ctx.env.PAYPAL_ENV === "sandbox" ? "sandbox" : "live",
        }
      : { configured: false },
  );

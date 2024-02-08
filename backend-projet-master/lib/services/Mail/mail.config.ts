import type { MailServiceConfig } from "./mail.interfaces";

const apiKey: string = process.env.SG_API_KEY;
const endpoint: string =
  process.env.SG_ENDPOINT || "https://api.sendgrid.com/v3/mail/send";
const from: string = process.env.SG_FROM_EMAIL || "example@.sendgrid.net";
const displayNameFrom: string =
  process.env.SG_FROM_DISPLAY_NAME ||
  "Team Book free session";

const mailServiceConfig: MailServiceConfig = {
  apiKey,
  endpoint,
  from,
  displayNameFrom,
};

export default mailServiceConfig;

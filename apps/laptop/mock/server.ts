import { SAMPLE_EVENT_ID } from "@mwhe/core";
import { startMockSite } from "@mwhe/core/mock";

const port = Number(process.env.PORT ?? 8787);
const site = await startMockSite({ port });
console.log(`MWHE mock site ${site.url}`);
console.log(`GET ${site.url}/functions/getRacePackage?eventId=${SAMPLE_EVENT_ID}`);
console.log("Authorization: Bearer <any token except forbidden>");

import { MOCK_DIRECTOR, MOCK_RIDER, MOCK_SITE_ORIGIN, SAMPLE_EVENT_ID } from "@mwhe/core";
import { startMockSite } from "@mwhe/core/mock";

const port = Number(process.env.PORT ?? 8787);
const site = await startMockSite({ port, host: "127.0.0.1" });
console.log(`MWHE mock site ${site.url}`);
console.log(`Race director: ${MOCK_DIRECTOR.email} / ${MOCK_DIRECTOR.password}`);
console.log(`Rider (rejected): ${MOCK_RIDER.email} / ${MOCK_RIDER.password}`);
console.log(`GET ${site.url}/functions/getRacePackage?eventId=${SAMPLE_EVENT_ID}`);
if (site.url !== MOCK_SITE_ORIGIN) {
  console.log(`Expected ${MOCK_SITE_ORIGIN}. Port ${port} was busy or overridden.`);
}

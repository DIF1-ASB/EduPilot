import { defineConfig } from '@playwright/test';
const baseURL=process.env.EDUPILOT_TEST_URL;
if(!baseURL||new URL(baseURL).origin!=='http://127.0.0.1:3400'||process.env.EDUPILOT_QA_RELEASE)throw Error('Set EDUPILOT_TEST_URL=http://127.0.0.1:3400 and use the isolated e2e/local-server.ts harness. Remote E2E is disabled.');
export default defineConfig({testDir:'./e2e',use:{baseURL,headless:true,channel:'msedge'},expect:{timeout:15000},timeout:90000,workers:1,reporter:'list'});

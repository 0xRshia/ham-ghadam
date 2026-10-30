import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
function moduleUrl(file, imports = {}) {
  let source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(JSON.stringify(specifier), JSON.stringify(url));
  return dataModule(source);
}
const organizerNavigationUrl = moduleUrl("lib/organizer-navigation.ts");
const loginDestinationUrl = moduleUrl("lib/login-destination.ts", { "./organizer-navigation": organizerNavigationUrl });
const navigationUrl = moduleUrl("lib/auth-navigation.ts", { "./login-destination": loginDestinationUrl });
const { authBackHref, authHomeHref, authHref } = await import(navigationUrl);
const { organizerProfileHref } = await import(organizerNavigationUrl);
const organizerDestination = organizerProfileHref("instagram:book.club", "/events/gallery?layout=v2#organizer");

for (const next of [null, "/welcome", "/login", "/signup", "//evil.example", "https://evil.example", "/events/one/tickets?next=/login"]) {
  assert.equal(authBackHref("login", next, null), "/", `Login back must escape an auth loop or unsafe target: ${next}`);
}
assert.equal(authBackHref("login", "/events/one/tickets", "v2"), "/events/one", "Back from a protected checkout opens its public event, avoiding a guest-login redirect loop");
for (const next of ["/events/one", "/events/one?quantity=2", "/account", "/reservations?booked=one", "/organizers/one", organizerDestination]) {
  assert.equal(authBackHref("login", next, null), next, "Preserve a validated originating page");
}
for (const mode of ["signup"]) {
  const back = new URL(authBackHref(mode, "/events/one/tickets", "v2"), "https://example.test");
  assert.equal(back.pathname, "/login");
  assert.equal(back.searchParams.get("next"), "/events/one/tickets", "Returning to login retains the post-login destination");
  assert.equal(back.searchParams.get("layout"), "v2");
  assert.equal(authBackHref("login", back.searchParams.get("next"), back.searchParams.get("layout")), "/events/one", "A second back escapes to public content");
}
assert.equal(authBackHref("login", null, "v2"), "/?layout=v2");
assert.equal(authHomeHref("v1"), "/?layout=v1");
assert.equal(authHref("/login", "https://evil.example", "unknown"), "/login");

// Exercise the actual welcome component at each step. Only framework hooks and
// navigation are replaced; the skip control, destination and callback are real.
const reactHooks = dataModule(`
  export const Suspense = ({children}) => children;
  export const useState = initial => [globalThis.__welcomeTest.step ?? initial, () => {}];
  export const useEffect = () => {};
`);
const { WelcomePage } = await import(moduleUrl("components/evenline/welcome.tsx", {
  "react": reactHooks,
  "react/jsx-runtime": pathToFileURL(require.resolve("react/jsx-runtime")).href,
  "next/navigation": dataModule(`export const useSearchParams = () => new URLSearchParams(globalThis.__welcomeTest.search);`),
  "@/components/event/app-navigation": dataModule(`export const AppLink = props => ({ type: "a", props: {...props, onClick() { props.onNavigate?.({preventDefault(){}}); globalThis.__welcomeTest.log.push({href:props.href,replace:props.replace}); }} });`),
  "@/components/event/event-browse-provider": dataModule(`export const useEventBrowse = () => ({completeMapIntroduction() {globalThis.__welcomeTest.log.push("completed");}});`),
  "@/lib/auth-navigation": navigationUrl,
  "@/locales/fa": dataModule(`export const copy = ${JSON.stringify({ skip: "فعلاً رد می‌کنم", getStarted: "شروع کنیم", signIn: "ورود", signUp: "ثبت‌نام" })};`),
  "./onboarding-art.json": dataModule(`export default ${readFileSync("components/evenline/onboarding-art.json", "utf8")};`),
  "./primitives": dataModule(`export const Button = props => ({type:"button",props}); export const LoadingState = () => null;`),
}));
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
for (const step of [0, 1, 2]) {
  globalThis.__welcomeTest = { step, search: "layout=v2", log: [] };
  const controls = elements(WelcomePage());
  const skips = controls.filter(node => node.type === "a" && node.props.className?.includes("el-welcome-skip"));
  assert.equal(skips.length, 1, `Welcome step ${step + 1} offers a visible skip link`);
  assert.equal(skips[0].props.children, "فعلاً رد می‌کنم");
  skips[0].props.onClick();
  assert.deepEqual(globalThis.__welcomeTest.log, ["completed", { href: "/?layout=v2", replace: true }], "Skip completes the introduction before replacing the welcome route with home");
}
delete globalThis.__welcomeTest;

const { AuthPage } = await import(moduleUrl("components/evenline/auth.tsx", {
  "@/lib/legal-versions": moduleUrl("lib/legal-versions.ts"),
  "@/components/legal/legal.module.css": dataModule(`export default {consent:"legal-consent"};`),
  "lucide-react": dataModule(`export const Phone = () => null;`),
  "react": dataModule(`
    export const Suspense = ({children}) => children;
    export const useState = initial => {
      const test=globalThis.__authTest,index=test.stateCursor++;
      if(!(index in test.states))test.states[index]=initial === null && test.challenge ? test.challenge : initial;
      return [test.states[index],value=>{test.states[index]=value;test.log.push({state:value});}];
    };
    export const useRef = initial => {
      const test=globalThis.__authTest,index=test.refCursor++;
      return test.refs[index]??=( {current:initial} );
    };
    export const useEffect = effect => {
      const test=globalThis.__authTest,index=test.effectCursor++;
      if(!(index in test.cleanups))test.cleanups[index]=effect();
    };
  `),
  "react/jsx-runtime": pathToFileURL(require.resolve("react/jsx-runtime")).href,
  "next/navigation": dataModule(`export const useSearchParams = () => new URLSearchParams(globalThis.__authTest.search);`),
  "@/components/event/app-navigation": dataModule(`export const AppLink = props => ({type:"a",props}); export const useAppNavigate = () => (href,options) => globalThis.__authTest.log.push({href,...options});`),
  "@/components/event/event-browse-provider": dataModule(`export const useEventBrowse = () => ({completeMapIntroduction() {globalThis.__authTest.log.push("completed");}});`),
  "@/components/event/auth-context": dataModule(`export const useAuth = () => {const test=globalThis.__authTest;return {refresh:async()=>{test.log.push("refresh");await test.refresh?.();}};};`),
  "@/hooks/use-deadline-clock": dataModule(`export const useDeadlineClock = () => 0;`),
  "@/lib/client": dataModule(`export const api = (...args) => {if(!globalThis.__authTest.api)throw new Error("Back navigation must not send an API request");return globalThis.__authTest.api(...args);};`),
  "@/lib/login-destination": loginDestinationUrl,
  "@/lib/auth-navigation": navigationUrl,
  "@/lib/types": dataModule(`export const digits = value => value; export const fa = value => String(value); export const faDigits = value => String(value);`),
  "@/locales/fa": dataModule(`export const copy = {};`),
  "./verification-code": dataModule(`export const VerificationCode = () => null;`),
  "./source-icon": dataModule(`export const FigmaIcon = () => null; export const Illustration = () => null;`),
  "./primitives": dataModule(`export const Button = props => ({type:"button",props}); export const Header = props => ({type:"header",props}); export const LoadingState = () => null; export const ErrorState = () => null;`),
}));
function createAuthTest(options = {}) {
  return globalThis.__authTest = { search: "", log: [], states: [], refs: [], cleanups: [], ...options };
}
function renderAuth(mode = "login") {
  Object.assign(globalThis.__authTest, { stateCursor: 0, refCursor: 0, effectCursor: 0 });
  return elements(AuthPage({ mode }));
}
for (const mode of ["login", "signup"]) {
  createAuthTest();
  const fields = renderAuth(mode).filter(node => node.type === "input").map(node => node.props.type);
  assert.deepEqual(fields.filter(type => type !== "checkbox" && type !== undefined), ["tel"], `${mode} asks only for a phone number; password sign-in is disabled`);
}
createAuthTest({ search: "layout=v2" });
const initialAuth = renderAuth();
const consent = initialAuth.find(node => node.type === "input" && node.props.type === "checkbox");
assert.equal(consent.props.checked, false, "Legal acceptance starts unchecked");
assert.equal(consent.props.required, true, "Legal acceptance is mandatory");
assert.ok(initialAuth.some(node => node.type === "a" && node.props.href === "/terms"), "Terms link opens the complete provided text");
let header = renderAuth().find(node => node.type === "header");
header.props.onBack();
assert.deepEqual(globalThis.__authTest.log, [{ state: false }, "completed", { href: "/?layout=v2", replace: true }], "Login back replaces the current entry with home and cannot append another welcome entry");

createAuthTest({ search: "next=%2Fevents%2Fone%2Ftickets&layout=v2" });
header = renderAuth().find(node => node.type === "header");
header.props.onBack();
assert.deepEqual(globalThis.__authTest.log, [{ state: false }, { href: "/events/one", replace: true }]);

createAuthTest({ challenge: { resendAt: 0 } });
header = renderAuth().find(node => node.type === "header");
header.props.onBack();
assert.deepEqual(globalThis.__authTest.log, [{ state: false }, { state: null }, { state: "" }, { state: "" }], "Verification back returns to the phone form without navigating away");

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes;reject=no; });
  return { promise, resolve, reject };
};
const tick = async () => { for(let index=0;index<12;index++)await Promise.resolve(); };
function requestHarness(options = {}) {
  const requests = [];
  const test = createAuthTest({ ...options, states: {0:true,...options.states}, api(url) { const pending=deferred();requests.push({url,...pending});return pending.promise; } });
  return { test, requests };
}
const submitForm = controls => controls.find(node => node.type === "form").props.onSubmit({preventDefault(){}});
const goBack = controls => controls.find(node => node.type === "header").props.onBack();
const user = { isHost: false, isAdmin: false };

let { test, requests } = requestHarness();
let controls = renderAuth();
submitForm(controls);submitForm(controls);
assert.equal(requests.length, 1, "Two immediate submits share one request lock");
assert.equal(requests[0].url, "/api/auth/request", "Login always starts with an SMS code request");
goBack(controls);
let checkpoint = test.log.length;
requests[0].resolve({user});await tick();
assert.equal(test.log.length, checkpoint, "A successful response received after Back cannot refresh, navigate or mutate the old form");

({test,requests}=requestHarness({challenge:{challengeId:"old",resendAt:0},states:{3:"123456"}}));
controls=renderAuth();submitForm(controls);goBack(controls);
controls=renderAuth();submitForm(controls);
assert.deepEqual(requests.map(request=>request.url), ["/api/auth/verify", "/api/auth/request"], "Back releases the form for a new OTP request");
requests[0].resolve({user});await tick();
assert.equal(test.states[5], true, "The stale verification's finally cannot unlock a newer pending request");
assert.equal(test.log.some(entry=>entry?.href || entry==="refresh"), false);
requests[1].resolve({challengeId:"new",resendAt:0});await tick();
assert.equal(test.states[4].challengeId,"new");
assert.equal(test.states[5],false,"Only the current request clears busy");

({test,requests}=requestHarness({challenge:{challengeId:"resend",resendAt:0},states:{3:"123456"}}));
controls=renderAuth();
const resend=controls.find(node=>node.type==="button" && node.props.className==="el-text-action");
resend.props.onClick();resend.props.onClick();submitForm(controls);
assert.equal(requests.length,1,"Resend and verification share the same synchronous lock");
requests[0].resolve({challengeId:"resent",resendAt:0});await tick();
assert.equal(test.states[4].challengeId,"resent");

({test,requests}=requestHarness());
controls=renderAuth();submitForm(controls);
test.cleanups.forEach(cleanup=>cleanup?.());checkpoint=test.log.length;
requests[0].resolve({user});await tick();
assert.equal(test.log.length,checkpoint,"Unmounted forms ignore delayed successful responses");

({test,requests}=requestHarness());
controls=renderAuth();submitForm(controls);goBack(controls);checkpoint=test.log.length;
requests[0].reject(new Error("late failure"));await tick();
assert.equal(test.log.length,checkpoint,"A stale failure cannot put an error into a dismissed form");

const refreshing=deferred();
({test,requests}=requestHarness({refresh:()=>refreshing.promise}));
controls=renderAuth();submitForm(controls);
requests[0].resolve({user});await tick();
assert.ok(test.log.includes("refresh"));
goBack(controls);checkpoint=test.log.length;
refreshing.resolve();await tick();
assert.equal(test.log.length,checkpoint,"Back during the account refresh still prevents a delayed redirect");

({test,requests}=requestHarness({search:new URLSearchParams({next:organizerDestination}).toString()}));
controls=renderAuth();submitForm(controls);
requests[0].resolve({user});await tick();
assert.ok(test.log.some(entry=>entry?.href===organizerDestination && entry.replace),"Guest login returns to the same namespaced organizer profile with its originating event context");
const signupUrl=new URL(authHref("/signup",organizerDestination,null),"https://example.test");
assert.equal(signupUrl.searchParams.get("next"),organizerDestination,"Auth mode switches preserve organizer and event return context");
delete globalThis.__authTest;
console.log("PASS safe auth back, welcome skips, stale request cancellation, unmount, refresh races and shared submit/resend locking");

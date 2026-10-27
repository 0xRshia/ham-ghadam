import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
function moduleUrl(file, imports = {}) {
  let output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const [specifier, url] of Object.entries(imports)) output = output.replaceAll(JSON.stringify(specifier), JSON.stringify(url));
  return dataModule(output);
}
const navigationUrl = moduleUrl("lib/organizer-navigation.ts");
const { organizerProfileHref, organizerBackHref, organizerReturnPath } = await import(navigationUrl);
const loginUrl = moduleUrl("lib/login-destination.ts", { "./organizer-navigation": navigationUrl });
const { loginDestination } = await import(loginUrl);
const identity = "instagram:book.club";
const sources = ["/", "/?layout=v2", "/events/gallery", "/events/gallery?layout=v2#organizer", "/events?query=%DA%A9%D8%AA%D8%A7%D8%A8&kind=organizers&city=tehran", "/following?view=discover", "/collections/weekend#events"];
for (const from of sources) {
  const destination = organizerProfileHref(identity, from);
  const url = new URL(destination, "https://example.test");
  assert.equal(url.pathname, "/organizers/instagram%3Abook.club", "Namespaced organizer identity is encoded once");
  assert.equal(organizerBackHref(identity, url.searchParams.get("from")), from, "Profile back preserves the originating page, query and section");
  assert.equal(loginDestination(destination), destination, "Guest login retains the profile and its return context");
}
for (const from of [null, "", "https://evil.example/events", "//evil.example/events", "/\\evil.example", "/%5Cevil.example", "/%2f%2fevil.example", "/events\n//evil.example", "/events/%00bad", "/%invalid", "/events/" + "a".repeat(2048)]) {
  assert.equal(organizerBackHref(identity, from), "/events", `Untrusted or absent return destination uses event discovery: ${from}`);
}
for (const value of ["/organizers/instagram%3Abook.club?from=https%3A%2F%2Fevil.example", "/organizers/one?from=%2F%2Fevil.example", "/organizers/one?from=%2Forganizers%2Fone", "/organizers/one?from=%2Fevents&from=%2Faccount", "/organizers/one?other=1", "/organizers/a%2Fb", "/organizers/a%00b", "/organizers/%invalid", "/organizers/one#unsafe"]) {
  assert.equal(loginDestination(value), "/account", `Guest login rejects malformed profile destination: ${value}`);
}
assert.equal(organizerProfileHref(identity), "/organizers/instagram%3Abook.club", "Shared/direct links have no browsing context");
assert.equal(organizerBackHref(identity, "/organizers/instagram%3Abook.club?from=%2Fevents"), "/events", "The back arrow cannot point at its own profile");
assert.equal(organizerReturnPath("/organizers/other?from=%2Fevents%2Fgallery#about"), "/organizers/other#about", "Cross-profile navigation does not recursively embed return queries");
const longDestination = organizerProfileHref(identity, "/events?query=" + "%D8%A7".repeat(260));
assert.ok(longDestination.length <= 2048, "Generated profile links remain bounded after URI escaping");
assert.equal(loginDestination(longDestination), longDestination);

// Execute the actual contextual link and all actual profile header branches.
// Only framework hooks, data and presentation children are substituted.
const jsx = dataModule(`
  export const Fragment = Symbol.for("react.fragment");
  export const jsx = (type,props,key) => ({type,props:props??{},key});
  export const jsxs = jsx;
`);
const hooks = dataModule(`export const useState = initial => [initial,()=>{}];`);
const nextNavigation = dataModule(`
  export const usePathname = () => globalThis.__organizerNavigationTest.pathname;
  export const useSearchParams = () => new URLSearchParams(globalThis.__organizerNavigationTest.search);
`);
const appNavigation = dataModule(`
  export const AppLink = props => ({type:"a",props});
  export const useAppNavigate = () => (href,options) => globalThis.__organizerNavigationTest.calls.push({href,...options});
`);
const linkUrl = moduleUrl("components/evenline/organizer-link.tsx", {
  "react/jsx-runtime": jsx,
  "next/navigation": nextNavigation,
  "@/components/event/app-navigation": appNavigation,
  "@/lib/organizer-navigation": navigationUrl,
});
const { OrganizerLink } = await import(linkUrl);
const componentUrl = moduleUrl("components/evenline/community.tsx", {
  "react": hooks,
  "react/jsx-runtime": jsx,
  "next/navigation": nextNavigation,
  "./notifications": dataModule(`export const NotificationsContent = () => null;`),
  "@/hooks/use-follow-state": dataModule(`export const useFollowRefresh = () => {};`),
  "./follow-control": dataModule(`export const FollowButton = () => null;export const FollowControl = () => null;`),
  "./organizer-profile-parts": dataModule(`export const OrganizerBiography = () => null;export const OrganizerCover = () => null;export const ShareOrganizer = () => null;`),
  "./instagram-link": dataModule(`export const InstagramLink = () => null;`),
  "./organizer-link": linkUrl,
  "@/components/event/app-navigation": appNavigation,
  "@/components/event/auth-context": dataModule(`export const useAuth = () => globalThis.__organizerNavigationTest.auth;`),
  "@/hooks/use-resource": dataModule(`export const useResource = url => { globalThis.__organizerNavigationTest.apiUrls.push(url);return globalThis.__organizerNavigationTest.resource; };`),
  "@/hooks/use-event-catalog": dataModule(`export const useEventCatalog = () => ({});`),
  "@/lib/client": dataModule(`export const api = () => {};`),
  "@/lib/types": dataModule(`export const fa = value => String(value);export const faDigits = value => String(value);`),
  "@/locales/fa": dataModule(`export const copy = {};`),
  "@/lib/organizer-navigation": navigationUrl,
  "./primitives": dataModule(`export const Header = props => ({type:"header",props});export const Button = () => null;export const LoadingState = () => null;export const ErrorState = () => null;export const useFavorites = () => ({});`),
  "./source-icon": dataModule(`export const Illustration = () => null;export const FigmaIcon = () => null;`),
  "./event-card": dataModule(`export const EventCard = () => null;`),
  "./avatar": dataModule(`export const Avatar = () => null;export const AvatarEditor = () => null;`),
});
const { OrganizerPage, OrganizerCard, OrganizerRow } = await import(componentUrl);
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
const previousWindow = globalThis.window;
try {
  const organizer = {id:identity,name:"باشگاه کتاب",event_count:1,followers:0,instagram_handle:"book.club",city:"تهران"};
  globalThis.__organizerNavigationTest = {pathname:"/events/gallery",search:"layout=v2",calls:[],apiUrls:[],auth:{loading:false,user:null},resource:{loading:false,data:{organizer,events:[],collections:[]},reload(){}}};
  const test = globalThis.__organizerNavigationTest;
  globalThis.window = {location:{pathname:test.pathname,search:"?"+test.search,hash:"#organizer"}};
  for (const component of [OrganizerRow,OrganizerCard]) {
    const profileLink = elements(component({organizer})).find(node => node.type === "a");
    assert.equal(new URL(profileLink.props.href,"https://example.test").searchParams.get("from"),"/events/gallery?layout=v2","Normal and new-tab links preserve their origin before clicking");
    profileLink.props.onNavigate({preventDefault(){}});
    assert.equal(new URL(test.calls.at(-1).href,"https://example.test").searchParams.get("from"),"/events/gallery?layout=v2#organizer","Normal profile navigation additionally preserves the current section");
  }
  let cancelled = false;
  const contextualLink=OrganizerLink({organizerId:identity,onNavigate:event=>{event.preventDefault();cancelled=true;}});
  const before=test.calls.length;
  contextualLink.props.onNavigate({preventDefault(){}});
  assert.equal(cancelled,true);
  assert.equal(test.calls.length,before,"A cancelled organizer link cannot navigate");

  test.pathname="/organizers/instagram%3Abook.club";
  const from="/events/gallery?layout=v2#organizer";
  test.search=new URLSearchParams({from}).toString();
  for(const branch of ["auth-loading","data-loading","404","network-error","profile"]){
    test.auth={loading:branch==="auth-loading",user:null};
    test.resource={loading:branch==="data-loading",data:branch==="profile"?{organizer,events:[],collections:[]}:null,error:branch==="404"?"Not found":branch==="network-error"?"Offline":"",errorStatus:branch==="404"?404:undefined,reload(){}};
    const header=elements(OrganizerPage({id:identity})).find(node=>node.type==="header");
    assert.equal(header.props.back,from,`${branch} retains the originating event destination`);
    header.props.onBack();
    assert.deepEqual(test.calls.at(-1),{href:from,replace:true},`${branch} replaces the profile instead of appending a back-navigation loop`);
  }
  assert.ok(test.apiUrls.every(url=>url==="/api/organizers/instagram%3Abook.club"),"Profile requests never encode the namespace twice");
  for(const search of ["","from=https%3A%2F%2Fevil.example","from=%2Forganizers%2Finstagram%253Abook.club"]){
    test.search=search;
    const header=elements(OrganizerPage({id:identity})).find(node=>node.type==="header");
    assert.equal(header.props.back,"/events","Direct/shared or unsafe profile destinations have a safe discovery fallback");
  }
}finally{
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  delete globalThis.__organizerNavigationTest;
}
console.log("PASS contextual organizer links, real profile headers in all states, safe bounded returns, namespaced login and direct-link fallbacks");

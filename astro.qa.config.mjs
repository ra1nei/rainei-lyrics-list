import config from './astro.config.mjs';
export default {...config, vite:{...config.vite, plugins:[...config.vite.plugins, {name:'sandbox-build-only',configResolved(c){c.optimizeDeps.include=[];c.optimizeDeps.noDiscovery=true;}}]}};

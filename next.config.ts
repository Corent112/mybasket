import type {NextConfig} from 'next';
const nextConfig:NextConfig={
 poweredByHeader:false,
 experimental:{serverActions:{bodySizeLimit:"4mb"}},
 async headers(){return [{source:'/:path*',headers:[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'SAMEORIGIN'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Strict-Transport-Security',value:'max-age=31536000'},
  // Avoid a restrictive script/media policy that would break the video and drawing tools.
  {key:'Content-Security-Policy',value:"base-uri 'self'; object-src 'none'; frame-ancestors 'self'"},
 ]}]},
};
export default nextConfig;

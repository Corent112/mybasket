"use client";

export default function ClubSectionPolish() {
  return (
    <style jsx global>{`
      .clubApp .clubContent *{box-sizing:border-box}
      .clubApp .clubContent input,
      .clubApp .clubContent select,
      .clubApp .clubContent textarea{max-width:100%;min-width:0}
      .clubApp .clubContent img{max-width:100%}
      .clubApp .clubContent .panel,
      .clubApp .clubContent .form,
      .clubApp .clubContent .main,
      .clubApp .clubContent .side,
      .clubApp .clubContent .calendar,
      .clubApp .clubContent .templates{min-width:0}
      .clubApp .clubContent table{width:100%;max-width:100%;table-layout:auto}
      .clubApp .clubContent th,
      .clubApp .clubContent td{overflow-wrap:anywhere}
      .clubApp .clubContent .alert{border-radius:10px!important}
      .clubApp .clubContent button{max-width:100%}
      .clubApp .clubContent .top{background:#fff!important;border-bottom:1px solid #ece6df!important}
      .clubApp .clubContent .top p{color:var(--club-secondary)!important}
      .clubApp .clubContent .top h2{color:#161616!important;font-family:Roboto,system-ui,sans-serif!important;font-weight:950!important}
      .clubApp .clubContent .top button:not(.ghost):not(.danger),
      .clubApp .clubContent .panelHead button:not(.ghost):not(.danger),
      .clubApp .clubContent .sideHead button:not(.ghost):not(.danger){background:var(--club-secondary)!important;border-color:var(--club-secondary)!important;color:white!important}
      .clubApp .clubContent textarea{resize:vertical}
      @media(max-width:980px){
        .clubApp .clubContent .layout{grid-template-columns:1fr!important}
        .clubApp .clubContent .grid2,
        .clubApp .clubContent .grid3{grid-template-columns:1fr!important}
      }
      @media(max-width:720px){
        .clubApp .clubContent .top{display:grid!important;align-items:start!important}
        .clubApp .clubContent .top>button{width:100%!important}
        .clubApp .clubContent .panelHead{align-items:flex-start!important;display:grid!important}
      }
    `}</style>
  );
}

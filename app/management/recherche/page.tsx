'use client';

/** Management → Recherche (§26) : recherche globale dans toutes les actions codées. */

import GlobalActionSearch from '../../../components/management/GlobalActionSearch';

export default function RecherchePage() {
  return (
    <>
      <div className="mg-steps"><span><b>Recherche globale :</b> retrouve n'importe quelle action codée à travers tous tes matchs, puis lis les clips.</span></div>
      <GlobalActionSearch />
    </>
  );
}
import Link from "next/link";

export default function InstallerPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
      <img src="/app-icons/mybasket-192.png" alt="" width="72" height="72" style={{ borderRadius: 16 }} />
      <h1>Installer mybasket.fr</h1>
      <p>Retrouve les fonctionnalités du site et connecte-toi avec ton compte MyBasket.</p>
      <h2>iPhone et iPad</h2>
      <p>Ouvre cette page dans Safari, touche <strong>Partager → Sur l’écran d’accueil</strong>, active <strong>Ouvrir comme app web</strong> si l’option apparaît, puis touche <strong>Ajouter</strong>.</p>
      <h2>Android</h2>
      <p>Ouvre cette page dans Chrome, puis choisis <strong>⋮ → Ajouter à l’écran d’accueil → Installer</strong>. Le libellé peut varier selon ton navigateur.</p>
      <Link href="/" style={{ display: "inline-block", padding: "12px 20px", background: "#6b1a2c", color: "white", borderRadius: 12, textDecoration: "none" }}>Ouvrir MyBasket</Link>
    </main>
  );
}

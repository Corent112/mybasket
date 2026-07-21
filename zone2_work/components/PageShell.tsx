import Header from "@/components/Header";

interface PageShellProps {
  title: string;
  intro: string;
}

export default function PageShell({ title, intro }: PageShellProps) {
  return (
    <>
      <Header />
      <main>
        <div className="container">
          <div className="section-title-bar">
            <h2>{title}</h2>
          </div>
          <p className="page-intro">{intro}</p>
        </div>
      </main>
    </>
  );
}
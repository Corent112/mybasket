type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BoutiqueProductPage({ params }: Props) {
  const { id } = await params;

  return (
    <main style={{ padding: "40px" }}>
      <h1>Produit {id}</h1>
      <p>Page produit en construction.</p>
    </main>
  );
}
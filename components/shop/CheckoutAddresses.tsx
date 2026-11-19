"use client";
import type { PostalAddress } from "@/lib/shop/shipping";
import styles from "./CheckoutAddresses.module.css";
export type CheckoutDelivery = {
  shipping: PostalAddress;
  billing: PostalAddress;
  same: boolean;
};
export default function CheckoutAddresses({
  value,
  onChange,
}: {
  value: CheckoutDelivery;
  onChange: (value: CheckoutDelivery) => void;
}) {
  function form(address: PostalAddress, kind: "shipping" | "billing") {
    const update = (key: keyof PostalAddress, text: string) =>
      onChange({ ...value, [kind]: { ...address, [key]: text } });
    return (
      <div className={styles.fields}>
        {(
          [
            ["name", "Nom complet", "name"],
            ["line1", "Adresse", "address-line1"],
            ["line2", "Complément (facultatif)", "address-line2"],
            ["postalCode", "Code postal", "postal-code"],
            ["city", "Ville", "address-level2"],
          ] as const
        ).map(([key, label, auto]) => (
          <label key={key}>
            {label}
            <input
              value={address[key]}
              autoComplete={`${kind} ${auto}`}
              onChange={(e) => update(key, e.target.value)}
              maxLength={200}
              required={key !== "line2"}
            />
          </label>
        ))}
        <label>
          Pays
          <select
            value={address.country}
            onChange={(e) => update("country", e.target.value)}
            autoComplete={`${kind} country`}
          >
            <option value="FR">France métropolitaine</option>
            <option value="MC">Monaco</option>
            <option value="AD">Andorre</option>
          </select>
        </label>
      </div>
    );
  }
  return (
    <section className={styles.root}>
      <h2>Livraison</h2>
      {form(value.shipping, "shipping")}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value.same}
          onChange={(e) => onChange({ ...value, same: e.target.checked })}
        />
        Mon adresse de facturation est identique
      </label>
      {!value.same && (
        <>
          <h3>Facturation</h3>
          {form(value.billing, "billing")}
        </>
      )}
    </section>
  );
}

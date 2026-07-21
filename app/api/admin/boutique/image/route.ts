import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin-server";

const BUCKET = "product-images";
const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function cleanName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  const { supabase, user } = await requireAdmin();
  const admin = createAdminClient();
  const storageClient = admin || supabase;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formats acceptés : PNG, JPG et WEBP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "L’image ne doit pas dépasser 8 Mo." },
        { status: 400 },
      );
    }

    if (admin) {
      const { data: buckets } = await admin.storage.listBuckets();
      const exists = buckets?.some((bucket) => bucket.id === BUCKET);
      if (!exists) {
        const { error: bucketError } = await admin.storage.createBucket(BUCKET, {
          public: true,
          fileSizeLimit: MAX_SIZE,
          allowedMimeTypes: Array.from(ALLOWED_TYPES),
        });
        if (bucketError) throw bucketError;
      }
    }

    const extension = file.name.split(".").pop() || "jpg";
    const baseName = cleanName(file.name.replace(/\.[^.]+$/, "")) || "produit";
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${baseName}.${extension}`;

    const { error: uploadError } = await storageClient.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = storageClient.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      path,
      publicUrl: data.publicUrl,
    });
  } catch (error) {
    console.error("ADMIN_PRODUCT_IMAGE_UPLOAD_ERROR", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de charger l’image.",
      },
      { status: 500 },
    );
  }
}

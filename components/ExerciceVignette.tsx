"use client";
import SchemaPreview from '@/components/library/SchemaPreview';
import { schemaPreviewImages } from '@/lib/library/schema-previews';
export default function ExerciceVignette({ schemaImages = [], images = [], video, alt = 'Schéma' }: { schemaImages?: string[]; images?: string[]; video?: string; alt?: string }) {
  return <div style={{ width: '100%', height: 150, overflow: 'hidden', borderRadius: 14 }}><SchemaPreview video={video} images={schemaPreviewImages({ schemaImages, images })} alt={alt} /></div>;
}

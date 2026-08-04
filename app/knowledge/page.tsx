import type { Metadata } from "next";
import KnowledgeClient from "./KnowledgeClient";

export const metadata: Metadata = {
  title: "Knowledge Base — Diagnostic Pacing",
};

// Same reasoning as /api/knowledge/public: this is clinical reference
// content, not patient data, so the page always reflects the live
// workbook rather than a cached build-time snapshot.
export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  return <KnowledgeClient />;
}

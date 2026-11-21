import { redirect } from "next/navigation";

export default async function LegacyFilmProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/film/studio/${id}`);
}

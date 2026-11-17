import { redirect } from "next/navigation";

export default async function ModelChecklistsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const { templateId } = await searchParams;
  const numId = templateId ? Number(templateId) : NaN;
  if (Number.isInteger(numId) && numId > 0) {
    redirect(`/master/checklist-templates/${numId}`);
  }
  redirect("/master/checklist-templates");
}

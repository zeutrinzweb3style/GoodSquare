import { CreateCommunityForm } from "@/components/community/create-community-form";

export const metadata = { title: "Create a Community" };

export default function NewCommunityPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Create a community
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You will be the owner. Owners can manage settings, members, and roles.
      </p>
      <div className="mt-8">
        <CreateCommunityForm />
      </div>
    </main>
  );
}

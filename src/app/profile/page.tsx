import { ProfileForm } from "@/components/profile/profile-form";
import { GoodDollarSection } from "@/components/gooddollar/gooddollar-section";

export const metadata = { title: "Square ID" };

export default function ProfilePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Square ID</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your wallet-based identity on Good Square. Public profiles can be viewed
        without a wallet connection.
      </p>
      <div className="mt-8">
        <ProfileForm />
      </div>
      <div className="mt-8">
        <GoodDollarSection />
      </div>
    </main>
  );
}

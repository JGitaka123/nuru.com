import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-ink-600">That listing or page may have been removed.</p>
      <Link href="/" className="mt-4 inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
        Back to home
      </Link>
    </div>
  );
}

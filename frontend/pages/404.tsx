export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#FFF2FA] flex items-center justify-center p-6">
      <div className="max-w-xl text-center bg-white border border-[#FFD9EC] rounded-3xl p-10 shadow-xl">
        <h1 className="text-5xl font-extrabold text-[#223047] mb-4">404</h1>
        <p className="text-lg text-[#223047] opacity-70 mb-6">
          The page you are looking for does not exist.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#F53799] text-white font-semibold hover:bg-[#D42A7D] transition-colors"
        >
          Go back home
        </a>
      </div>
    </div>
  );
}

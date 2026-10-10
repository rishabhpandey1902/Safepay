import Link from "next/link";

const steps = [
  { title: "Agree", text: "Set the amount, the milestones and the rules for approval, cancellation and disputes." },
  { title: "Fund", text: "The payer deposits the money into the SafePay contract. Nobody can withdraw it early." },
  { title: "Deliver", text: "The other person submits each milestone with proof of the work." },
  { title: "Release", text: "The payer approves, or the money releases automatically after the approval window." },
];

const reasons = [
  {
    title: "Protects both sides",
    text: "The payer is not sending everything upfront, and the other person cannot be left waiting forever. Disputed money stays locked until a resolver decides.",
  },
  {
    title: "Works across borders",
    text: "See prices in your own currency. Payments settle in a stablecoin, so the amount agreed is the amount released. Currency conversion is for display only.",
  },
  {
    title: "Sign in with email",
    text: "A wallet is created for you when you sign in, so you can start without installing anything.",
  },
];

export default function Home() {
  return (
    <main className="flex-1 bg-slate-950 px-6 py-12 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <section className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Pay now. Release when it&apos;s done.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
            Send money with conditions attached. SafePay holds the payment and releases it milestone by
            milestone, so you can pay someone you don&apos;t fully trust yet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/create" className="rounded-xl bg-violet-600 px-6 py-3 font-semibold hover:bg-violet-500">
              Create SafePay
            </Link>
            <Link href="/services" className="rounded-xl border border-teal-500/50 bg-teal-500/10 px-6 py-3 font-semibold text-teal-200 hover:bg-teal-500/20">
              Find freelancer
            </Link>
            <Link href="/projects" className="rounded-xl border border-teal-500/50 px-6 py-3 font-semibold text-teal-200 hover:bg-teal-500/10">
              Find work
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-violet-300">Step {index + 1}</p>
                <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {reasons.map((reason) => (
            <div key={reason.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-lg font-semibold">{reason.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{reason.text}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">Need someone to work with?</h2>
          <p className="mt-2 text-sm text-slate-400">
            SafePay works with anyone you already know. You can also find freelancers or work from
            anywhere in the world, then protect the payment with a SafePay agreement.
          </p>
        </section>

        <p className="mt-10 text-center text-xs text-slate-500">
          Testnet prototype running on Monad testnet with test tokens. Do not use real money.
        </p>
      </div>
    </main>
  );
}
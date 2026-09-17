export default function StructuredData() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://shouldibuy.it";

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${siteUrl}/#app`,
        name: "Should I Buy It?",
        alternateName: "Should I Buy This Affordability Simulator",
        url: siteUrl,
        applicationCategory: "FinanceApplication",
        operatingSystem: "All",
        browserRequirements: "Requires modern JavaScript-enabled web browser",
        description:
          "Intelligent financial simulator that mathematically models 90-day cash flow, upcoming paychecks, recurring bills, and emergency reserve buffers to give definitive purchase verdicts.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        featureList: [
          "90-Day Cash Flow Liquidity Simulation",
          "Automated Emergency Buffer Breach Detection",
          "Objective 4-Tier Decision Verdicts (BUY_NOW, SAFE_DELAY, HIGH_RISK, DECLINE)",
          "Payroll Cycle and Bill Schedule Mapping",
          "Local-First Privacy Mode with Optional Cloud History",
        ],
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "Should I Buy It?",
        url: siteUrl,
        logo: `${siteUrl}/icon.svg`,
        sameAs: [],
      },
      {
        "@type": "HowTo",
        "@id": `${siteUrl}/#howto`,
        name: "How to Check If You Can Afford a Purchase",
        description:
          "Follow these three simple steps to simulate your 90-day cash flow trajectory and know with certainty whether you should buy now or wait.",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Configure Your Cash Flow Baseline",
            text: "Input your current liquid cash balance, recurring payroll schedule, predictable fixed monthly expenses, and minimum emergency reserve buffer.",
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Enter the Purchase Details",
            text: "Specify the item name, total upfront cost or financing terms, category, and target purchase date.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Review the 90-Day Liquidity Curve",
            text: "Evaluate the interactive 90-day balance projection, identified trough risk dates, and the actionable decision verdict.",
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "How does 'Should I Buy It?' determine if I can afford a purchase?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Rather than simply checking if your current bank account balance exceeds the item price, our simulation projects your day-by-day cash flow over the next 90 days. It accounts for upcoming salary disbursements, recurring bill due dates, and your required emergency buffer. If the purchase would cause your liquid balance to dip below your safety cushion at any point over 90 days, it alerts you.",
            },
          },
          {
            "@type": "Question",
            name: "Why is looking at my bank balance not enough before buying?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Bank balances reflect a static snapshot, not future commitments. A balance of $3,000 may seem adequate for an $800 laptop today, but if rent ($1,500) and insurance ($400) are due in 5 days before your next paycheck arrives, making that purchase creates an immediate liquidity crisis.",
            },
          },
          {
            "@type": "Question",
            name: "What are the four decision outcomes?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The engine produces one of four definitive verdicts: 1) BUY NOW: Purchase is fully absorbed without risking your emergency floor. 2) SAFE DELAY: Deferring purchase by 2-4 weeks aligns it with incoming cash flow. 3) HIGH RISK: Leaves minimal margin for unexpected expenses. 4) DECLINE: Purchase would deplete emergency reserves or cause negative cash flow.",
            },
          },
          {
            "@type": "Question",
            name: "Does 'Should I Buy It?' require my banking credentials?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. 'Should I Buy It?' runs in Local Mode by default without requiring bank logins, Plaid integrations, or credit card linking. You manually input high-level numbers and simulations run instantly in your browser.",
            },
          },
          {
            "@type": "Question",
            name: "What should my minimum emergency buffer be?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Financial planners generally advise maintaining at least 1 to 3 months of basic living expenses as a liquid reserve. In our simulator, you define your personal comfort floor (e.g. $1,000 to $5,000) so the algorithm never permits an impulse buy that compromises your financial security.",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

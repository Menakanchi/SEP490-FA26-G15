"use client";

import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingWorkflow } from "@/components/landing/LandingWorkflow";
import { LandingAudience } from "@/components/landing/LandingAudience";
import { LandingGallery } from "@/components/landing/LandingGallery";
import { LandingStandards } from "@/components/landing/LandingStandards";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingContactForm } from "@/components/landing/LandingContactForm";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-blue-600">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      }
    >
      <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-600 selection:text-white font-sans">
        <LandingHeader />
        <main>
          <LandingHero />
          <LandingWorkflow />
          <LandingAudience />
          <LandingGallery />
          <LandingStandards />
          <LandingFAQ />
          <LandingContactForm />
        </main>
        <LandingFooter />
      </div>
    </Suspense>
  );
}

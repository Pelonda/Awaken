"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    //  redirect to your site
    router.replace("/sites/cmnxjweow0000lu6k3cyobgkf");
  }, [router]);

  return null;
}
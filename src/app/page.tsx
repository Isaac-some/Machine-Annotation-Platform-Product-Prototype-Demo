"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export default function Home() { const router=useRouter(); useEffect(()=>{router.replace("/hawk/project/");},[router]); return <main style={{padding:32}}><Link href="/hawk/project/">打开机器标注平台演示</Link></main>; }

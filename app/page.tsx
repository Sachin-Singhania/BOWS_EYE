"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, Loader2, Download, Database } from "lucide-react"
import { downloadLog, downloadReport, checkStatus, getHealth, startProcess } from "@/lib/utils"
import Image from "next/image"
type ProcessingStep = "idle" | "crawler" | "parameters" | "orchestrator" | "complete"

interface StepResult {
  crawler?: {
    pagesFound: number
    status: string
    pages?: string[]
  }
  parameters?: {
    totalParams: number
    params: Array<{ name?: string; method?: string; action?: string; postdata?: any }>
  }
  orchestrator?: {
    sqlmapStatus: string
  }
}

export default function HomePage() {
  const [url, setUrl] = useState("")
  const [isLoaded, setIsLoaded] = useState(false)
  const [currentStep, setCurrentStep] = useState<ProcessingStep>("idle")
  const [stepResults, setStepResults] = useState<StepResult>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [runId, setRunId] = useState<number | null>(null)
  const [orchestratorLoadingMap, setOrchestratorLoadingMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setIsLoaded(true)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate")
          }
        })
      },
      { threshold: 0.1 },
    )

    const scrollElements = document.querySelectorAll(".scroll-animate")
    scrollElements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

  async function pollStatus<T = any>(
    rid: number,
    param: "crawl_results" | "discovered_params" | "running_sql_injection",
    condition: (res: any) => boolean,
    intervalMs = 1000,
    timeoutMs = 120_000,
  ): Promise<any> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await checkStatus(String(rid), param)
        if (condition(res)) return res
      } catch (err) {
        // ignore and retry
        // console.warn("polling error", err)
      }
      await delay(intervalMs)
    }
    throw new Error(`Polling timed out for param=${param}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsProcessing(true)
    setCurrentStep("crawler")
    setStepResults({})
    setRunId(null)

    try {
      const startResp = await startProcess(url)
      const rid = Number(startResp.run_id ?? startResp.runId ?? startResp.runId)
      setRunId(rid)

      // 1) Poll for crawl_results
      // while running => show status Running. When dump  (or state completed) parse it.
      setCurrentStep("crawler")
      // condition: dump exists or state == completed
      const crawlResp = await pollStatus(
        rid,
        "crawl_results",
        (r) => {
          return !!r.dump || (r.state && r.state !== "running") // accept dump or non-running state
        },
        2000,
        120_000,
      )

      let pagesFound = 0
      let pages: string[] = []
      if (crawlResp?.dump?.content) {
        try {
          // dump.content might be a stringified JSON array (or string)
          const parsed = JSON.parse(crawlResp.dump.content)
          if (Array.isArray(parsed)) {
            pagesFound = parsed.length
            pages = parsed
          }
          else pagesFound = 0
        } catch (err) {
          pagesFound = 0
        }
      }

      setStepResults((prev) => ({
        ...prev,
        crawler: {
          pagesFound,
          pages,
          status: crawlResp.state === "running" ? "Running" : "Crawling completed successfully",
        },
      }))

      // 2) Poll for discovered_params (Parameter Analysis)
      setCurrentStep("parameters")
      const paramsResp = await pollStatus(
        rid,
        "discovered_params",
        (r) => !!r.dump,
        2000,
        120_000,
      )

      // parse params array from paramsResp.dump.content
      let paramsArray: any[] = []
      if (paramsResp?.dump?.content) {
        try {
          const parsed = JSON.parse(paramsResp.dump.content)
          if (Array.isArray(parsed)) paramsArray = parsed
        } catch (err) {
          paramsArray = []
        }
      }

      setStepResults((prev) => ({
        ...prev,
        parameters: {
          totalParams: paramsArray.length,
          params: paramsArray.map((p) => ({
            name: p.name,
            method: p.method,
            action: p.action,
            postdata: p.postdata,
          })),
        },
      }))

      // 3) Orchestrator: show each parameter action URL with loading animation
      setCurrentStep("orchestrator")

      // initialize loading map
      const actionUrls = paramsArray
        .map((p) => p.action)
        .filter(Boolean)
        .map((a: string) => a as string)

      const loadingMapInit: Record<string, boolean> = {}
      actionUrls.forEach((u) => (loadingMapInit[u] = true))
      setOrchestratorLoadingMap(loadingMapInit)

      // Poll running_sql_injection until completed with status DONE in dump.content
      const injectionResp = await pollStatus(
        rid,
        "running_sql_injection",
        (r) => {
          if (!r) return false
          if (r.state === "completed" && r.dump?.content) {
            try {
              const parsed = JSON.parse(r.dump.content)
              return parsed?.status?.toUpperCase() === "DONE"
            } catch (err) {
              return false
            }
          }
          return false
        },
        6000,
        600_000,   // 8 minutes timeout (480,000 ms)
      )

      const stoppedMap: Record<string, boolean> = {}
      actionUrls.forEach((u) => (stoppedMap[u] = false))
      setOrchestratorLoadingMap(stoppedMap)

      setStepResults((prev) => ({
        ...prev,
        orchestrator: {
          sqlmapStatus: "SQL injection testing completed",
        },
      }))

      setCurrentStep("complete")
    } catch (err) {
      console.error("Processing error", err)
      setStepResults((prev) => ({
        ...prev,
        orchestrator: {
          sqlmapStatus: "Processing Done",
          injectionPoints: 0,
          vulnerabilities: [],
        },
      }))
      setCurrentStep("complete")
    } finally {
      setIsProcessing(false)
    }
  }

  const resetAnalysis = () => {
    setCurrentStep("idle")
    setStepResults({})
    setIsProcessing(false)
    setRunId(null)
    setOrchestratorLoadingMap({})
  }

  return (
    <div className="min-h-screen matte-surface">
      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-6 lg:px-12">
        <div className="w-full max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-10 gap-8 items-center">
            {/* Logo Section - 30% width */}

            <div
              className={`lg:col-span-3 flex justify-center lg:justify-start ${isLoaded ? "animate-slide-in-left" : "opacity-0"}`}
            >
              <div className="relative">
                <div className="w-48 h-48 lg:w-64 lg:h-64 rounded-full bg-gradient-to-br from-primary/30 to-accent/40 flex items-center justify-center backdrop-blur-sm border border-primary/20 shadow-2xl shadow-primary/10">
                  <div className="text-6xl lg:text-7xl font-mono font-bold text-primary">  <Image
                    src="/logo.png"          // put your logo in the /public folder
                    alt="Bow's Eye Logo"
                    width={160}              // size for lg:w-64
                    height={160}
                  /></div>
                </div>
                <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                  <div className="w-3 h-3 rounded-full bg-primary-foreground"></div>
                </div>
              </div>
            </div>

            {/* Welcome Text Section - 70% width */}
            <div
              className={`lg:col-span-7 space-y-6 text-center lg:text-left ${isLoaded ? "animate-slide-in-right animate-delay-200" : "opacity-0"}`}
            >
              <div className="space-y-4">
                <h1 className="text-4xl lg:text-6xl xl:text-7xl font-light text-balance leading-tight">
                  Hello! Welcome to <span className="font-medium text-primary glow-text">{"Bow's Eye"}</span>
                </h1>

                <div
                  className={`flex justify-center lg:justify-end ${isLoaded ? "animate-fade-in-up animate-delay-400" : "opacity-0"}`}
                >
                  <p className="text-sm lg:text-base text-muted-foreground font-mono">Created by Jatin & Sachin</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Description Section */}
      <section className="py-24 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-3xl lg:text-4xl font-light text-balance scroll-animate">
            Bow's Eye Architecture
          </h2>

          <div className="grid md:grid-cols-2 gap-12 mt-16">
            <div className="space-y-4 scroll-animate">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto md:mx-0 shadow-lg shadow-primary/10">
                <div className="w-6 h-6 rounded-full bg-primary"></div>
              </div>
              <h3 className="text-xl font-medium text-primary">Frontend Architecture</h3>
              <p className="text-muted-foreground leading-relaxed">
                The frontend is built using Next.js with TypeScript, structured for scalability and maintainability. It utilizes Tailwind CSS for utility-first styling and is hosted on AWS for deployment and distribution.
              </p>
            </div>

            <div className="space-y-4 scroll-animate">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mx-auto md:mx-0 shadow-lg shadow-primary/10">
                <div className="w-6 h-6 rounded-full bg-primary"></div>
              </div>
              <h3 className="text-xl font-medium text-primary">Backend Architecture</h3>
              <p className="text-muted-foreground leading-relaxed">
                The backend is developed using FastAPI with Python, featuring a modular and high-performance API architecture. It integrates SQLite for lightweight data storage and leverages core Python libraries for data handling and processing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* URL Input Section */}
      <section className="py-24 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card/80 backdrop-blur-sm border border-primary/20 rounded-2xl p-8 lg:p-12 space-y-8 shadow-2xl shadow-primary/5 scroll-animate">
            <div className="text-center space-y-4">
              <h2 className="text-2xl lg:text-3xl font-light text-primary">Enter the URL</h2>
              <p className="text-muted-foreground">Provide a URL to begin your precision analysis</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="url" className="text-sm font-medium text-primary">
                  Website URL
                </Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12 text-base bg-background/50 border-primary/30 focus:border-primary focus:ring-primary/20 transition-all duration-300"
                  required
                  disabled={isProcessing}
                />
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  className="flex-1 h-12 text-base font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30"
                  disabled={!url.trim() || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze URL"
                  )}
                </Button>

                {currentStep !== "idle" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetAnalysis}
                    className="h-12 px-6 bg-transparent"
                    disabled={isProcessing}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </form>

            {currentStep !== "idle" && (
              <div className="space-y-6 mt-8">
                {/* Crawler Card */}
                <Card className={`transition-all duration-500 ${currentStep === "crawler" ? "ring-2 ring-primary" : ""}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-lg">
                      {currentStep === "crawler" ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : stepResults.crawler ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted" />
                      )}
                      Web Crawler
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!stepResults.crawler && currentStep === "crawler" && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Crawling website and discovering pages...
                      </div>
                    )}

                    {stepResults.crawler && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Pages Found:</span>
                          <span className="font-medium">{stepResults.crawler.pagesFound}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <span className="">{stepResults.crawler.status}</span>
                        </div>
                        {/* {stepResults.crawler.status === "Crawling completed successfully" && (
                          <div className="text-xs text-muted-foreground">Crawl finished.</div>
                        )} */}
                        {stepResults.crawler.pages && stepResults.crawler.pagesFound > 0 && (
                          <div className="mt-3 max-h-40 overflow-y-auto border rounded-md p-2 bg-muted/30 scrollbar-hide">
                            <ul className="space-y-1 text-xs scrollbar-hide">
                              {stepResults.crawler.pages.map((url: string, idx: number) => (
                                <li
                                  key={idx}
                                  className="truncate hover:text-primary"
                                  title={url}
                                >
                                  {url}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Parameters Card */}
                {(currentStep === "parameters" || stepResults.parameters) && (
                  <Card
                    className={`transition-all duration-500 ${currentStep === "parameters" ? "ring-2 ring-primary" : ""}`}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-3 text-lg">
                        {currentStep === "parameters" ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        ) : stepResults.parameters ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-muted" />
                        )}
                        Parameter Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {currentStep === "parameters" && !stepResults.parameters && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing URL parameters and forms...
                        </div>
                      )}

                      {stepResults.parameters && (
                        <div className="space-y-4 text-sm">
                          <div className="flex justify-between">
                            <span>Total Parameters:</span>
                            <span className="font-medium">{stepResults.parameters.totalParams}</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr>
                                  <th className="text-left px-3 py-2">Name</th>
                                  <th className="text-left px-3 py-2">Method</th>
                                  <th className="text-left px-3 py-2">Action / URL</th>
                                  <th className="text-left px-3 py-2">Postdata</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stepResults.parameters.params.map((p, i) => (
                                  <tr key={i} className="border-t">
                                    <td className="px-3 py-2">{p.name ?? "-"}</td>
                                    <td className="px-3 py-2">{p.method ?? "-"}</td>
                                    <td className="px-3 py-2 break-words max-w-xs">{p.action ?? "-"}</td>
                                    <td className="px-3 py-2">
                                      {p.postdata ? <pre className="text-xs">{JSON.stringify(p.postdata)}</pre> : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Orchestrator Card */}
                {(currentStep === "orchestrator" || stepResults.orchestrator || currentStep === "complete") && (
                  <Card
                    className={`transition-all duration-500 ${currentStep === "orchestrator" ? "ring-2 ring-primary" : ""}`}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-3 text-lg">
                        {currentStep === "orchestrator" ? (
                          <Database className="w-5 h-5 text-primary animate-pulse" />
                        ) : stepResults.orchestrator ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-muted" />
                        )}
                        SQL Injection Orchestrator
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {currentStep === "orchestrator" && !stepResults.orchestrator && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Database className="w-4 h-4 animate-pulse" />
                            Running SQLMap injection tests...
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: "60%" }}></div>
                          </div>

                          {/* list parameter action URLs with loading spinner */}
                          <div className="space-y-2 mt-3">
                            {(stepResults.parameters?.params || []).map((p, idx) => {
                              const action = p.action ?? "-"
                              const loading = orchestratorLoadingMap[action] ?? currentStep === "orchestrator"
                              return (
                                <div key={idx} className="flex items-center justify-between">
                                  <div className="truncate max-w-3xl">{action}</div>
                                  <div className="flex items-center gap-2">
                                    {loading ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="italic text-xs">running</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-green-600">done</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {stepResults.orchestrator && (
                        <div className="space-y-2 text-sm">
                          <div className="text-green-600 font-medium">{stepResults.orchestrator.sqlmapStatus}</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Downloads */}
                {currentStep === "complete" && (
                  <Card className="ring-2 ring-green-500">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-3 text-lg">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        Analysis Complete
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Your security analysis is complete. Download the detailed results below.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button onClick={downloadLog} variant="outline" className="flex items-center gap-2 bg-transparent">
                            <Download className="w-4 h-4" />
                            Download Log File
                          </Button>
                          <Button onClick={downloadReport} className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Download Report
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 lg:px-12 border-t border-primary/20">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-muted-foreground font-mono">© 2025 {"Bow's Eye"}. Created for Web Security Project</p>
        </div>
      </footer>

      <style jsx>{`
        .glow-text {
          text-shadow: 0 0 20px oklch(0.75 0.15 40 / 0.3);
        }
      `}</style>
    </div>
  )
}

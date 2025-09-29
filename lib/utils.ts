import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import axios from 'axios';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function getHealth() {
  const baseUrl = process.env.NEXT_PUBLIC_ENDPOINT;
  const res= await axios.get(baseUrl+"/status");
  console.log(res.data);
//   {
//   "message": "Hello, World!"
// }
  return res.data;
} 
export async function startProcess(url:string) {
  const baseUrl = process.env.NEXT_PUBLIC_ENDPOINT;
  const end = `${baseUrl}/scan`;
    const res = await axios.post(end, {
      url,
    });
  console.log(res.data);

  //you will get runId
//   {
//   "message": "Scan started in background.",
//   "run_id": 7,
//   "status_url": "/status/7",
//   "state": "running"
// }
  return res.data;
}
export async function checkStatus( runId:string, param?: "discovered_params" | "crawl_results" | "running_sql_injection") {
  const baseUrl = process.env.NEXT_PUBLIC_ENDPOINT;
  const url = `${baseUrl}/status/${runId}`;
 const res = await axios.get(url, {
      params: { param }, // optional param: crawl_results | discovered_params
    });
  console.log(res.data);

  //crawl_results
//   {
//   "run_id": 7,
//   "target": "http://testphp.vulnweb.com",
//   "state": "running",
//   "dump": {
//     "filename": "crawled.json",
//     "content": "[\"http://testphp.vulnweb.com\", \"http://testphp.vulnweb.com/index.php\", \"http://testphp.vulnweb.com/categories.php\", \"http://testphp.vulnweb.com/artists.php\", \"http://testphp.vulnweb.com/disclaimer.php\", \"http://testphp.vulnweb.com/cart.php\", \"http://testphp.vulnweb.com/guestbook.php\", \"http://testphp.vulnweb.com/AJAX/index.php\", \"http://testphp.vulnweb.com/login.php\", \"http://testphp.vulnweb.com/userinfo.php\", \"http://testphp.vulnweb.com/privacy.php\", \"http://testphp.vulnweb.com/Mod_Rewrite_Shop\", \"http://testphp.vulnweb.com/hpp\", \"http://testphp.vulnweb.com/search.php?test=query\", \"http://testphp.vulnweb.com/listproducts.php?cat=1\", \"http://testphp.vulnweb.com/listproducts.php?cat=2\", \"http://testphp.vulnweb.com/listproducts.php?cat=3\", \"http://testphp.vulnweb.com/listproducts.php?cat=4\", \"http://testphp.vulnweb.com/artists.php?artist=1\", \"http://testphp.vulnweb.com/artists.php?artist=2\", \"http://testphp.vulnweb.com/artists.php?artist=3\", \"http://testphp.vulnweb.com/signup.php\", \"http://testphp.vulnweb.com/Details/network-attached-storage-dlink/1\", \"http://testphp.vulnweb.com/Details/web-camera-a4tech/2\", \"http://testphp.vulnweb.com/Details/color-printer/3\", \"http://testphp.vulnweb.com/hpp?pp=12\"]"
//   }
// }
// discovered_params
// {
//   "run_id": 6,
//   "target": "http://testphp.vulnweb.com",
//   "state": "running",
//   "dump": {
//     "filename": "params.json",
//     "content": "[{\"name\": \"test\", \"method\": \"GET\", \"action\": \"http://testphp.vulnweb.com/search.php?test=query\", \"postdata\": null}, {\"name\": \"cat\", \"method\": \"GET\", \"action\": \"http://testphp.vulnweb.com/listproducts.php?cat=1\", \"postdata\": null}, {\"name\": \"artist\", \"method\": \"GET\", \"action\": \"http://testphp.vulnweb.com/artists.php?artist=1\", \"postdata\": null}, {\"name\": \"pp\", \"method\": \"GET\", \"action\": \"http://testphp.vulnweb.com/hpp?pp=12\", \"postdata\": null}]"
//   }
// }
// running_sql_injection
// {
//   "run_id": 12,
//   "target": "http://testphp.vulnweb.com",
//   "state": "completed",
//   "dump": {
//     "filename": "sqlInjection.json",
//     "content": "{\"status\": \"DONE\"}"
//   }
// }
  return res.data;
}
export async function downloadLog() {
  try {
      const baseUrl = process.env.NEXT_PUBLIC_ENDPOINT  + "/file/log";
      const response = await fetch(baseUrl);
    if (!response.ok) throw new Error("Failed to fetch log file");

    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = "log.txt";
    link.click();
    window.URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error("Error downloading log:", error);
  }
}

export async function downloadReport() {
  try {
      const baseUrl = process.env.NEXT_PUBLIC_ENDPOINT + "/file/report";
    const response = await fetch(baseUrl);
    if (!response.ok) throw new Error("Failed to fetch report file");

    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = "report.md";
    link.click();
    window.URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error("Error downloading report:", error);
  }
}

import { sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('purchase_success');
const alreadyPurchasedRate = new Rate('already_purchased');
const soldOutRate = new Rate('sold_out');

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'constant-arrival-rate',
      rate: 2000, // 2000 requests per second
      timeUnit: '1s',
      duration: '5s', // Run for 5 seconds
      preAllocatedVUs: 100,
      maxVUs: 10000,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% HTTP errors
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const SALE_ID = __ENV.SALE_ID || '';

if (!SALE_ID) {
  throw new Error('SALE_ID environment variable is required. Run: export SALE_ID=<uuid-from-database>');
}

export default function () {
  // Generate unique user ID for this VU and iteration
  const userId = `user_${__VU}_${__ITER}`;

  // Attempt purchase
  const purchasePayload = JSON.stringify({
    saleId: SALE_ID,
    userId: userId,
  });

  const purchaseParams = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const purchaseRes = http.post(
    `${API_URL}/api/v1/sale/purchase`,
    purchasePayload,
    purchaseParams
  );

  if (purchaseRes.status === 200 && purchaseRes.body) {
    try {
      const body = JSON.parse(purchaseRes.body);
      
      // Track metrics based on response status
      successRate.add(body.status === 'SUCCESS');
      alreadyPurchasedRate.add(body.status === 'ALREADY_PURCHASED');
      soldOutRate.add(body.status === 'SOLD_OUT');

      // Log sample results
      if (__ITER < 5) {
        console.log(`User ${userId}: ${body.status} - ${body.message}`);
      }
    } catch (e) {
      console.error(`Failed to parse response: ${e.message}`);
    }
  }

  // Minimal delay to prevent local client overload
  sleep(0.01);
}

export function handleSummary(data) {
  return {
    'stress-test/results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const metrics = data.metrics;
  
  let summary = '\n' + '='.repeat(80) + '\n';
  summary += '                    FLASH SALE STRESS TEST RESULTS\n';
  summary += '='.repeat(80) + '\n\n';

  // Request statistics
  summary += '📊 REQUEST STATISTICS:\n';
  summary += `   Total Requests: ${metrics.http_reqs?.values?.count || 0}\n`;
  summary += `   Failed Requests: ${metrics.http_req_failed?.values?.passes || 0} (${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%)\n\n`;

  // Response time
  summary += '⏱️  RESPONSE TIME:\n';
  summary += `   Average: ${(metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms\n`;
  summary += `   Median (p50): ${(metrics.http_req_duration?.values?.['p(50)'] || 0).toFixed(2)}ms\n`;
  summary += `   p95: ${(metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms\n`;
  summary += `   p99: ${(metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(2)}ms\n`;
  summary += `   Max: ${(metrics.http_req_duration?.values?.max || 0).toFixed(2)}ms\n\n`;

  // Purchase results
  summary += '🛒 PURCHASE RESULTS:\n';
  if (metrics.purchase_success) {
    summary += `   SUCCESS: ${metrics.purchase_success.values.passes || 0} (${((metrics.purchase_success.values.rate || 0) * 100).toFixed(2)}%)\n`;
  }
  if (metrics.already_purchased) {
    summary += `   ALREADY_PURCHASED: ${metrics.already_purchased.values.passes || 0} (${((metrics.already_purchased.values.rate || 0) * 100).toFixed(2)}%)\n`;
  }
  if (metrics.sold_out) {
    summary += `   SOLD_OUT: ${metrics.sold_out.values.passes || 0} (${((metrics.sold_out.values.rate || 0) * 100).toFixed(2)}%)\n`;
  }

  summary += '\n' + '='.repeat(80) + '\n';
  summary += '⚠️  Next Steps: Run validation queries to verify data integrity\n';
  summary += '='.repeat(80) + '\n\n';

  return summary;
}

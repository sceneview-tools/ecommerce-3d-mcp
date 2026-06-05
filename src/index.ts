#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authenticate, recordRender, requiresTier } from "./auth.js";
import { TIER_CONFIG } from "./types.js";
import type { ConfiguratorOption } from "./types.js";
import type { ARCategory, SizeGuideCategory } from "./generators.js";
import {
  generateModelViewerEmbed,
  createARTryOnEmbed,
  generateConfigurator,
  generateOptimizationReport,
  generateTurntableEmbed,
  generateShopifySnippet,
  generateShopifySnippetV2,
  generateSEO3DMetadata,
  generateEnhancedSEO3DMetadata,
  generateProductPage,
  analyzeConversion,
  generateSizeGuide,
  generateWooCommerceSnippet,
} from "./generators.js";

// ---------------------------------------------------------------------------
// Legal disclaimer
// ---------------------------------------------------------------------------

const DISCLAIMER = '\n\n---\n*Review all generated code before deploying to production. See [TERMS.md](https://github.com/sceneview-tools/ecommerce-3d-mcp/blob/main/TERMS.md).*';

function addDisclaimer(text: string): string {
  return text + DISCLAIMER;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "ecommerce-3d-mcp",
  version: "2.1.0",
});

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const ProductSchema = {
  name: z.string().describe("Product name"),
  description: z.string().optional().describe("Product description"),
  category: z.string().optional().describe("Product category (e.g. furniture, clothing)"),
  imageUrls: z.array(z.string()).optional().describe("Product image URLs"),
  modelUrl: z.string().optional().describe("URL to existing .glb 3D model"),
  dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
      depth: z.number(),
      unit: z.string().default("cm"),
    })
    .optional()
    .describe("Physical dimensions"),
  apiKey: z.string().optional().describe("API key for authentication (optional, free tier by default)"),
};

// ---------------------------------------------------------------------------
// Tool: generate_product_3d
// ---------------------------------------------------------------------------

server.tool(
  "generate_product_3d",
  "Generate a <model-viewer> 3D embed for a product page. Returns ready-to-paste HTML with AR support, camera controls, and responsive sizing.",
  {
    ...ProductSchema,
    autoRotate: z.boolean().default(true).describe("Enable auto-rotation"),
    cameraControls: z.boolean().default(true).describe("Enable camera controls"),
    ar: z.boolean().default(true).describe("Enable AR button"),
    backgroundColor: z.string().default("#ffffff").describe("Background color (hex)"),
    poster: z.string().optional().describe("URL to poster image shown while loading"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!recordRender(params.apiKey)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Render limit reached (${ctx.rendersUsed}/${ctx.rendersLimit} this month). Upgrade to ${ctx.tier === "free" ? "Growth ($29/mo)" : "Enterprise ($99/mo)"} for more renders.`,
          },
        ],
      };
    }

    const html = generateModelViewerEmbed(
      {
        name: params.name,
        description: params.description,
        category: params.category,
        imageUrls: params.imageUrls,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      {
        autoRotate: params.autoRotate,
        cameraControls: params.cameraControls,
        ar: params.ar,
        backgroundColor: params.backgroundColor,
        poster: params.poster,
      },
    );

    return {
      content: [
        {
          type: "text" as const,
          text: addDisclaimer(html),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: create_ar_tryout
// ---------------------------------------------------------------------------

server.tool(
  "create_ar_tryout",
  "Create an AR try-on experience embed. Supports furniture placement, clothing/accessory try-on. Includes iOS Quick Look and Android Scene Viewer deep links.",
  {
    ...ProductSchema,
    arCategory: z
      .enum(["furniture", "clothing", "accessories", "footwear", "cosmetics", "other"])
      .default("other")
      .describe("Product category for AR placement mode"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!requiresTier(ctx, "growth")) {
      return {
        content: [
          {
            type: "text" as const,
            text: "AR try-on requires the Growth tier ($29/mo) or higher. Visit https://ecommerce3d.dev/pricing to upgrade.",
          },
        ],
      };
    }
    if (!recordRender(params.apiKey)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Render limit reached. Upgrade to Enterprise ($99/mo) for unlimited renders.`,
          },
        ],
      };
    }

    const html = createARTryOnEmbed(
      {
        name: params.name,
        description: params.description,
        category: params.category,
        imageUrls: params.imageUrls,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      params.arCategory as ARCategory,
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: product_configurator
// ---------------------------------------------------------------------------

server.tool(
  "product_configurator",
  "Generate an interactive 3D product configurator with color/material/size options. Returns a self-contained HTML widget with model-viewer, option controls, and price updates.",
  {
    ...ProductSchema,
    options: z
      .array(
        z.object({
          name: z.string().describe("Option name (e.g. Color, Material, Size)"),
          type: z
            .enum(["color", "material", "size", "variant"])
            .describe("Option type"),
          values: z.array(
            z.object({
              label: z.string().describe("Display label"),
              value: z.string().describe("Value (hex for color, id for others)"),
              thumbnail: z.string().optional().describe("Thumbnail URL"),
              priceModifier: z
                .number()
                .optional()
                .describe("Price change from base (+/-)"),
            }),
          ),
        }),
      )
      .describe("Configuration options"),
    enableAR: z.boolean().default(false).describe("Enable AR in configurator"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!requiresTier(ctx, "growth")) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Product configurator requires the Growth tier ($29/mo) or higher.",
          },
        ],
      };
    }
    if (!recordRender(params.apiKey)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Render limit reached.`,
          },
        ],
      };
    }

    const html = generateConfigurator(
      {
        name: params.name,
        description: params.description,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      params.options as ConfiguratorOption[],
      { ar: params.enableAR },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: optimize_3d_asset
// ---------------------------------------------------------------------------

server.tool(
  "optimize_3d_asset",
  "Generate an optimization report and CLI commands for a 3D model. Covers polygon reduction, texture compression (KTX2), Draco mesh compression, LOD generation, and web performance targets.",
  {
    ...ProductSchema,
    targetPolyCount: z.number().default(50000).describe("Target polygon count"),
    compressTextures: z.boolean().default(true).describe("Enable texture compression"),
    textureMaxSize: z.number().default(1024).describe("Max texture dimension (px)"),
    generateLODs: z.boolean().default(true).describe("Generate LOD variants"),
    format: z
      .enum(["glb", "gltf", "usdz"])
      .default("glb")
      .describe("Output format"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!requiresTier(ctx, "growth")) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Asset optimization requires the Growth tier ($29/mo) or higher.",
          },
        ],
      };
    }

    const report = generateOptimizationReport(
      {
        name: params.name,
        description: params.description,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      {
        targetPolyCount: params.targetPolyCount,
        compressTextures: params.compressTextures,
        textureMaxSize: params.textureMaxSize,
        generateLODs: params.generateLODs,
        format: params.format,
      },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(report) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: generate_turntable
// ---------------------------------------------------------------------------

server.tool(
  "generate_turntable",
  "Create a 360-degree turntable animation embed for product pages. Auto-rotating 3D view with a '360' badge, responsive sizing, and optional camera controls.",
  {
    ...ProductSchema,
    speed: z.number().default(30).describe("Rotation speed in degrees per second"),
    backgroundColor: z.string().default("#ffffff").describe("Background color (hex)"),
    height: z.string().default("500px").describe("Viewer height (CSS value)"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!recordRender(params.apiKey)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Render limit reached (${ctx.rendersUsed}/${ctx.rendersLimit}).`,
          },
        ],
      };
    }

    const html = generateTurntableEmbed(
      {
        name: params.name,
        description: params.description,
        modelUrl: params.modelUrl,
      },
      {
        speed: params.speed,
        backgroundColor: params.backgroundColor,
        height: params.height,
      },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: shopify_snippet
// ---------------------------------------------------------------------------

server.tool(
  "shopify_snippet",
  "Generate a Shopify Liquid snippet to embed a 3D product viewer. Supports both legacy Liquid and Online Store 2.0 section format with theme editor settings, metafield references, and AR support.",
  {
    ...ProductSchema,
    enableAR: z.boolean().default(true).describe("Enable AR in Shopify viewer"),
    sectionId: z.string().default("product-3d-viewer").describe("HTML section ID"),
    version: z.enum(["legacy", "2.0"]).default("2.0").describe("Shopify Liquid version — 'legacy' for classic themes, '2.0' for Online Store 2.0 (Dawn, Sense, Craft)"),
  },
  async (params) => {
    const generator = params.version === "2.0" ? generateShopifySnippetV2 : generateShopifySnippet;
    const html = generator(
      {
        name: params.name,
        description: params.description,
        modelUrl: params.modelUrl,
      },
      { ar: params.enableAR, sectionId: params.sectionId },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: woocommerce_snippet
// ---------------------------------------------------------------------------

server.tool(
  "woocommerce_snippet",
  "Generate a WooCommerce/WordPress plugin snippet to embed a 3D product viewer. Includes custom meta boxes for model URLs, model-viewer integration, and AR support.",
  {
    ...ProductSchema,
    enableAR: z.boolean().default(true).describe("Enable AR in WooCommerce viewer"),
    sectionId: z.string().default("product-3d-viewer").describe("HTML container ID"),
  },
  async (params) => {
    const html = generateWooCommerceSnippet(
      {
        name: params.name,
        description: params.description,
        modelUrl: params.modelUrl,
      },
      { ar: params.enableAR, sectionId: params.sectionId },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: seo_3d_metadata
// ---------------------------------------------------------------------------

server.tool(
  "seo_3d_metadata",
  "Generate enhanced schema.org structured data (JSON-LD) for products with 3D models. Includes Product, 3DModel (GLB + USDZ), AggregateRating, MerchantReturnPolicy, and shipping details. Optimized for Google 3D/AR search badges.",
  {
    ...ProductSchema,
    price: z.number().optional().describe("Product price"),
    currency: z.string().default("USD").describe("Currency code (ISO 4217)"),
    availability: z
      .enum(["InStock", "OutOfStock", "PreOrder"])
      .default("InStock")
      .describe("Stock status"),
    brand: z.string().optional().describe("Brand name"),
    sku: z.string().optional().describe("SKU / product ID"),
    gtin: z.string().optional().describe("GTIN / EAN / UPC barcode"),
    url: z.string().optional().describe("Product page URL"),
    usdzUrl: z.string().optional().describe("URL to .usdz model (iOS AR)"),
    thumbnailUrl: z.string().optional().describe("3D model thumbnail image URL"),
    ratingValue: z.number().optional().describe("Average rating (1-5)"),
    reviewCount: z.number().optional().describe("Number of reviews"),
    returnDays: z.number().optional().describe("Return policy — number of days"),
    returnType: z.enum(["full", "exchange", "store-credit"]).optional().describe("Return policy type"),
    freeShipping: z.boolean().default(false).describe("Free shipping available"),
  },
  async (params) => {
    const html = generateEnhancedSEO3DMetadata(
      {
        name: params.name,
        description: params.description,
        imageUrls: params.imageUrls,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      {
        price: params.price,
        currency: params.currency,
        availability: params.availability,
        brand: params.brand,
        sku: params.sku,
        gtin: params.gtin,
        url: params.url,
        usdzUrl: params.usdzUrl,
        thumbnailUrl: params.thumbnailUrl,
        aggregateRating:
          params.ratingValue !== undefined && params.reviewCount !== undefined
            ? { ratingValue: params.ratingValue, reviewCount: params.reviewCount }
            : undefined,
        returnPolicy:
          params.returnDays !== undefined
            ? { days: params.returnDays, type: params.returnType || "full" }
            : undefined,
        shippingFree: params.freeShipping,
      },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: generate_product_page
// ---------------------------------------------------------------------------

server.tool(
  "generate_product_page",
  "Generate a complete Shopify-ready product page HTML with integrated 3D viewer, AR button, breadcrumbs, price, reviews, dimensions, and CTA. Choose from minimal, modern, or luxury themes.",
  {
    ...ProductSchema,
    theme: z.enum(["minimal", "modern", "luxury"]).default("modern").describe("Page design theme"),
    price: z.number().optional().describe("Product price"),
    currency: z.string().default("USD").describe("Currency code"),
    showARButton: z.boolean().default(true).describe("Show AR button"),
    ctaText: z.string().default("Add to Cart").describe("Call-to-action button text"),
    breadcrumbs: z.array(z.string()).optional().describe("Breadcrumb trail (e.g. ['Home', 'Furniture'])"),
    ratingValue: z.number().optional().describe("Average rating (1-5)"),
    reviewCount: z.number().optional().describe("Number of reviews"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!recordRender(params.apiKey)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Render limit reached (${ctx.rendersUsed}/${ctx.rendersLimit}).`,
          },
        ],
      };
    }

    const html = generateProductPage(
      {
        name: params.name,
        description: params.description,
        category: params.category,
        imageUrls: params.imageUrls,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      {
        theme: params.theme,
        price: params.price,
        currency: params.currency,
        showARButton: params.showARButton,
        ctaText: params.ctaText,
        breadcrumbs: params.breadcrumbs,
        reviews:
          params.ratingValue !== undefined && params.reviewCount !== undefined
            ? { rating: params.ratingValue, count: params.reviewCount }
            : undefined,
      },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: analyze_conversion
// ---------------------------------------------------------------------------

server.tool(
  "analyze_conversion",
  "Analyze a 3D product page and generate actionable tips to improve conversion rates. Scores the page (0-100) based on 3D model, AR, performance, mobile, SEO, and interactivity best practices.",
  {
    hasModel: z.boolean().default(false).describe("Product page has a 3D model viewer"),
    hasAR: z.boolean().default(false).describe("AR try-on/placement is available"),
    hasMultipleAngles: z.boolean().default(false).describe("Multiple camera angles / turntable"),
    hasConfigurator: z.boolean().default(false).describe("Interactive configurator available"),
    loadTimeSec: z.number().optional().describe("3D model load time in seconds"),
    modelSizeMB: z.number().optional().describe("3D model file size in MB"),
    hasPosterImage: z.boolean().default(false).describe("Poster image shown while loading"),
    isMobileOptimized: z.boolean().default(false).describe("Page is mobile-optimized"),
    hasStructuredData: z.boolean().default(false).describe("Has schema.org 3DModel data"),
    category: z.string().optional().describe("Product category (furniture, clothing, etc.)"),
  },
  async (params) => {
    const result = analyzeConversion({
      hasModel: params.hasModel,
      hasAR: params.hasAR,
      hasMultipleAngles: params.hasMultipleAngles,
      hasConfigurator: params.hasConfigurator,
      loadTimeSec: params.loadTimeSec,
      modelSizeMB: params.modelSizeMB,
      hasPosterImage: params.hasPosterImage,
      isMobileOptimized: params.isMobileOptimized,
      hasStructuredData: params.hasStructuredData,
      category: params.category,
    });

    return {
      content: [{ type: "text" as const, text: addDisclaimer(result.summary) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: generate_size_guide
// ---------------------------------------------------------------------------

server.tool(
  "generate_size_guide",
  "Generate an AR-based size guide for clothing, footwear, furniture, or accessories. Includes measurement instructions, size chart, international conversion table, and optional AR model for real-world sizing.",
  {
    ...ProductSchema,
    sizeCategory: z
      .enum(["clothing", "footwear", "furniture", "accessories"])
      .describe("Product size category"),
    sizes: z
      .array(
        z.object({
          label: z.string().describe("Size label (e.g. 'S', 'M', 'L')"),
          measurements: z.record(z.string(), z.number()).describe("Measurement name to value map"),
          unit: z.string().optional().describe("Measurement unit (default: cm)"),
        }),
      )
      .optional()
      .describe("Custom size chart data"),
    enableAR: z.boolean().default(true).describe("Enable AR measurement feature"),
    showConversionChart: z.boolean().default(true).describe("Show international size conversion"),
    targetRegions: z.array(z.string()).default(["US", "EU", "UK"]).describe("Regions for size conversion"),
  },
  async (params) => {
    const ctx = authenticate(params.apiKey);
    if (!recordRender(params.apiKey)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Render limit reached (${ctx.rendersUsed}/${ctx.rendersLimit}).`,
          },
        ],
      };
    }

    const html = generateSizeGuide(
      {
        name: params.name,
        description: params.description,
        category: params.category,
        imageUrls: params.imageUrls,
        modelUrl: params.modelUrl,
        dimensions: params.dimensions,
      },
      {
        category: params.sizeCategory as SizeGuideCategory,
        sizes: params.sizes,
        enableAR: params.enableAR,
        showConversionChart: params.showConversionChart,
        targetRegions: params.targetRegions,
      },
    );

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: search_3d_models (Sketchfab API)
// ---------------------------------------------------------------------------

server.tool(
  "search_3d_models",
  "Search Sketchfab for downloadable 3D models by keyword, category, or tag. Returns model names, thumbnails, viewer URLs, vertex/face counts, and license info. Great for finding 3D assets for e-commerce product pages. No auth required for search; set SKETCHFAB_API_TOKEN env var for download links and expanded results.",
  {
    query: z.string().describe("Search query (e.g. 'modern chair', 'sneaker', 'watch')"),
    categories: z
      .array(
        z.enum([
          "animals-pets",
          "architecture",
          "art-abstract",
          "cars-vehicles",
          "characters-creatures",
          "cultural-heritage-history",
          "electronics-gadgets",
          "fashion-style",
          "food-drink",
          "furniture-home",
          "music",
          "nature-plants",
          "news-politics",
          "people",
          "places-travel",
          "science-technology",
          "sports-fitness",
          "weapons-military",
        ]),
      )
      .optional()
      .describe("Sketchfab category filter(s)"),
    downloadable: z.boolean().default(true).describe("Only show downloadable models"),
    animated: z.boolean().optional().describe("Filter for animated models"),
    count: z.number().default(5).describe("Number of results (1-24)"),
    sort_by: z
      .enum(["relevance", "likeCount", "viewCount", "publishedAt"])
      .default("relevance")
      .describe("Sort order"),
  },
  async (params) => {
    const apiToken = process.env.SKETCHFAB_API_TOKEN;
    const url = new URL("https://api.sketchfab.com/v3/search");
    url.searchParams.set("type", "models");
    url.searchParams.set("q", params.query);
    url.searchParams.set("downloadable", String(params.downloadable));
    url.searchParams.set("count", String(Math.min(Math.max(params.count, 1), 24)));
    url.searchParams.set("sort_by", `-${params.sort_by}`);

    if (params.categories?.length) {
      for (const cat of params.categories) {
        url.searchParams.append("categories", cat);
      }
    }
    if (params.animated !== undefined) {
      url.searchParams.set("animated", String(params.animated));
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiToken) {
      headers["Authorization"] = `Token ${apiToken}`;
    }

    try {
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Sketchfab API error: ${res.status} ${res.statusText}. Check your query and try again.`,
            },
          ],
        };
      }

      const data = (await res.json()) as {
        results: Array<{
          uid: string;
          name: string;
          description?: string;
          viewerUrl: string;
          thumbnails?: { images?: Array<{ url: string; width: number }> };
          vertexCount?: number;
          faceCount?: number;
          isDownloadable?: boolean;
          animationCount?: number;
          license?: { label: string; url: string };
          user?: { displayName: string; profileUrl: string };
          tags?: Array<{ name: string }>;
          publishedAt?: string;
          likeCount?: number;
          viewCount?: number;
        }>;
        cursors?: { next?: string };
      };

      if (!data.results?.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No 3D models found for "${params.query}". Try a broader search term.`,
            },
          ],
        };
      }

      const models = data.results.map((m) => {
        const thumb =
          m.thumbnails?.images?.find((i) => i.width >= 200 && i.width <= 512)?.url ||
          m.thumbnails?.images?.[0]?.url;

        return {
          uid: m.uid,
          name: m.name,
          viewerUrl: m.viewerUrl,
          thumbnailUrl: thumb || null,
          vertexCount: m.vertexCount ?? null,
          faceCount: m.faceCount ?? null,
          animated: (m.animationCount ?? 0) > 0,
          downloadable: m.isDownloadable ?? false,
          license: m.license ? { name: m.license.label, url: m.license.url } : null,
          author: m.user
            ? { name: m.user.displayName, profileUrl: m.user.profileUrl }
            : null,
          tags: m.tags?.map((t) => t.name) ?? [],
          likeCount: m.likeCount ?? 0,
          viewCount: m.viewCount ?? 0,
          embedHtml: `<div class="sketchfab-embed-wrapper"><iframe title="${m.name}" frameborder="0" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="autoplay; fullscreen; xr-spatial-tracking" src="https://sketchfab.com/models/${m.uid}/embed?autostart=1&ui_theme=dark" width="100%" height="480"></iframe></div>`,
        };
      });

      let text = `## Sketchfab 3D Models for "${params.query}"\n\nFound ${data.results.length} model(s):\n\n`;
      for (const m of models) {
        text += `### ${m.name}\n`;
        text += `- **UID**: \`${m.uid}\`\n`;
        text += `- **Viewer**: ${m.viewerUrl}\n`;
        if (m.thumbnailUrl) text += `- **Thumbnail**: ${m.thumbnailUrl}\n`;
        text += `- **Vertices**: ${m.vertexCount?.toLocaleString() ?? "N/A"} | **Faces**: ${m.faceCount?.toLocaleString() ?? "N/A"}\n`;
        text += `- **Animated**: ${m.animated ? "Yes" : "No"} | **Downloadable**: ${m.downloadable ? "Yes" : "No"}\n`;
        if (m.license) text += `- **License**: ${m.license.name}\n`;
        if (m.author) text += `- **Author**: ${m.author.name}\n`;
        if (m.tags.length) text += `- **Tags**: ${m.tags.slice(0, 8).join(", ")}\n`;
        text += "\n";
      }

      if (!apiToken) {
        text += `---\n**Tip**: Set \`SKETCHFAB_API_TOKEN\` env var for download links and expanded results. Get a free API token at https://sketchfab.com/settings/password\n`;
      }

      return {
        content: [{ type: "text" as const, text: addDisclaimer(text) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to search Sketchfab: ${err instanceof Error ? err.message : String(err)}. Check your network connection.`,
          },
        ],
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_model_details (Sketchfab API)
// ---------------------------------------------------------------------------

server.tool(
  "get_model_details",
  "Get full details for a Sketchfab 3D model by URL or UID. Returns name, description, tags, categories, available formats, embed HTML, and viewer URL. Useful for inspecting a model before embedding it in a product page.",
  {
    model: z
      .string()
      .describe(
        "Sketchfab model UID (e.g. 'a1b2c3d4') or full URL (e.g. 'https://sketchfab.com/3d-models/chair-a1b2c3d4')",
      ),
  },
  async (params) => {
    const apiToken = process.env.SKETCHFAB_API_TOKEN;

    // Extract UID from URL or use as-is
    let uid = params.model.trim();
    const urlMatch = uid.match(/sketchfab\.com\/(?:3d-models\/[^/]+-)?([a-f0-9]{32})/i)
      || uid.match(/sketchfab\.com\/models\/([a-f0-9]{32})/i);
    if (urlMatch) {
      uid = urlMatch[1];
    }
    // Also handle short UIDs that aren't 32 chars (some older models)
    uid = uid.replace(/[^a-f0-9]/gi, "");

    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiToken) {
      headers["Authorization"] = `Token ${apiToken}`;
    }

    try {
      const res = await fetch(`https://api.sketchfab.com/v3/models/${uid}`, { headers });
      if (!res.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Sketchfab API error: ${res.status} ${res.statusText}. Verify the model UID or URL is correct.`,
            },
          ],
        };
      }

      const m = (await res.json()) as {
        uid: string;
        name: string;
        description?: string;
        viewerUrl: string;
        thumbnails?: { images?: Array<{ url: string; width: number }> };
        vertexCount?: number;
        faceCount?: number;
        isDownloadable?: boolean;
        animationCount?: number;
        license?: { label: string; url: string };
        user?: { displayName: string; profileUrl: string };
        tags?: Array<{ name: string }>;
        categories?: Array<{ name: string }>;
        publishedAt?: string;
        likeCount?: number;
        viewCount?: number;
        archives?: { glb?: { size: number }; gltf?: { size: number }; usdz?: { size: number } };
      };

      const thumb =
        m.thumbnails?.images?.find((i) => i.width >= 200 && i.width <= 512)?.url ||
        m.thumbnails?.images?.[0]?.url;

      let text = `## ${m.name}\n\n`;
      if (m.description) {
        // Truncate long descriptions
        const desc = m.description.length > 300 ? m.description.slice(0, 300) + "..." : m.description;
        text += `${desc}\n\n`;
      }
      text += `- **UID**: \`${m.uid}\`\n`;
      text += `- **Viewer URL**: ${m.viewerUrl}\n`;
      if (thumb) text += `- **Thumbnail**: ${thumb}\n`;
      text += `- **Vertices**: ${m.vertexCount?.toLocaleString() ?? "N/A"} | **Faces**: ${m.faceCount?.toLocaleString() ?? "N/A"}\n`;
      text += `- **Animated**: ${(m.animationCount ?? 0) > 0 ? "Yes" : "No"}\n`;
      text += `- **Downloadable**: ${m.isDownloadable ? "Yes" : "No"}\n`;
      if (m.license) text += `- **License**: ${m.license.label} (${m.license.url})\n`;
      if (m.user) text += `- **Author**: ${m.user.displayName} — ${m.user.profileUrl}\n`;
      if (m.categories?.length) text += `- **Categories**: ${m.categories.map((c) => c.name).join(", ")}\n`;
      if (m.tags?.length) text += `- **Tags**: ${m.tags.map((t) => t.name).join(", ")}\n`;
      if (m.likeCount) text += `- **Likes**: ${m.likeCount.toLocaleString()} | **Views**: ${(m.viewCount ?? 0).toLocaleString()}\n`;

      text += `\n### Embed Code\n\n\`\`\`html\n<div class="sketchfab-embed-wrapper">\n  <iframe title="${m.name}" frameborder="0" allowfullscreen\n    mozallowfullscreen="true" webkitallowfullscreen="true"\n    allow="autoplay; fullscreen; xr-spatial-tracking"\n    src="https://sketchfab.com/models/${m.uid}/embed?autostart=1&ui_theme=dark"\n    width="100%" height="480">\n  </iframe>\n</div>\n\`\`\`\n`;

      if (m.isDownloadable && apiToken) {
        text += `\n### Download\n\nModel is downloadable. Use the Sketchfab download API:\n\`\`\`\nGET https://api.sketchfab.com/v3/models/${m.uid}/download\nAuthorization: Token YOUR_TOKEN\n\`\`\`\n`;
      } else if (m.isDownloadable && !apiToken) {
        text += `\n### Download\n\nModel is downloadable but requires authentication. Set \`SKETCHFAB_API_TOKEN\` env var to get download links.\n`;
      }

      return {
        content: [{ type: "text" as const, text: addDisclaimer(text) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to fetch model details: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: generate_product_embed
// ---------------------------------------------------------------------------

server.tool(
  "generate_product_embed",
  "Generate a ready-to-use HTML embed for a 3D product viewer using either a Sketchfab URL or a direct GLB/GLTF model URL. Uses the <model-viewer> web component with AR support, responsive sizing, and customizable appearance.",
  {
    sketchfab_url: z
      .string()
      .optional()
      .describe("Sketchfab model URL (e.g. 'https://sketchfab.com/3d-models/chair-abc123')"),
    model_url: z
      .string()
      .optional()
      .describe("Direct URL to a GLB or GLTF 3D model file"),
    width: z.string().default("100%").describe("Viewer width (CSS value)"),
    height: z.string().default("500px").describe("Viewer height (CSS value)"),
    autoplay: z.boolean().default(true).describe("Auto-rotate the model"),
    ar: z.boolean().default(true).describe("Show AR button (model-viewer only, requires GLB)"),
    poster: z.string().optional().describe("Poster image URL shown while loading"),
    background_color: z.string().default("#f5f5f5").describe("Background color (hex)"),
    alt_text: z.string().optional().describe("Alt text for accessibility"),
  },
  async (params) => {
    if (!params.sketchfab_url && !params.model_url) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Please provide either `sketchfab_url` or `model_url`. Use `search_3d_models` to find models on Sketchfab.",
          },
        ],
      };
    }

    // Sketchfab embed (iframe)
    if (params.sketchfab_url && !params.model_url) {
      const uidMatch =
        params.sketchfab_url.match(/sketchfab\.com\/(?:3d-models\/[^/]+-)?([a-f0-9]{32})/i) ||
        params.sketchfab_url.match(/sketchfab\.com\/models\/([a-f0-9]{32})/i);

      if (!uidMatch) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Could not extract model UID from the Sketchfab URL. Expected format: https://sketchfab.com/3d-models/name-<uid> or https://sketchfab.com/models/<uid>",
            },
          ],
        };
      }

      const uid = uidMatch[1];
      const embedParams = new URLSearchParams({
        autostart: params.autoplay ? "1" : "0",
        ui_theme: "dark",
        ui_infos: "0",
        ui_watermark: "0",
      });

      const html = `<!-- Sketchfab 3D Product Viewer -->
<div class="product-3d-viewer" style="position:relative; width:${params.width}; max-width:100%;">
  <iframe
    title="${params.alt_text || "3D Product Viewer"}"
    src="https://sketchfab.com/models/${uid}/embed?${embedParams.toString()}"
    style="width:100%; height:${params.height}; border:none; border-radius:8px; background:${params.background_color};"
    allow="autoplay; fullscreen; xr-spatial-tracking"
    allowfullscreen
    mozallowfullscreen="true"
    webkitallowfullscreen="true">
  </iframe>
</div>`;

      return {
        content: [{ type: "text" as const, text: addDisclaimer(html) }],
      };
    }

    // model-viewer embed (GLB/GLTF)
    const modelSrc = params.model_url!;
    const arAttr = params.ar ? ' ar ar-modes="webxr scene-viewer quick-look"' : "";
    const autoRotate = params.autoplay ? " auto-rotate" : "";
    const posterAttr = params.poster ? ` poster="${params.poster}"` : "";

    const html = `<!-- 3D Product Viewer — model-viewer web component -->
<!-- Include the model-viewer script in your <head>: -->
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>

<model-viewer
  src="${modelSrc}"
  alt="${params.alt_text || "3D product model"}"${posterAttr}
  camera-controls${autoRotate}${arAttr}
  shadow-intensity="1"
  shadow-softness="0.5"
  exposure="1"
  style="width:${params.width}; height:${params.height}; max-width:100%; background-color:${params.background_color}; border-radius:8px; overflow:hidden;"
  loading="lazy"
  reveal="auto">
  ${params.ar ? `<button slot="ar-button" style="
    position:absolute; bottom:16px; right:16px;
    padding:8px 16px; border:none; border-radius:20px;
    background:#333; color:#fff; font:14px/1 sans-serif;
    cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
    View in AR
  </button>` : ""}
</model-viewer>

<!--
  Tips:
  - Use .glb format for best compatibility (GLB = binary glTF)
  - Keep model under 5 MB for fast loading on mobile
  - Add a poster image for instant visual feedback
  - Test AR on iOS Safari (Quick Look) and Android Chrome (Scene Viewer)
  - For USDZ (iOS), add: ios-src="model.usdz"
-->`;

    return {
      content: [{ type: "text" as const, text: addDisclaimer(html) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: search_product_images (Unsplash API)
// ---------------------------------------------------------------------------

server.tool(
  "search_product_images",
  "Search Unsplash for high-quality product photos for e-commerce mockups, lifestyle shots, or backgrounds. Returns image URLs in multiple sizes, photographer credit, and download links. Requires UNSPLASH_ACCESS_KEY env var (free at unsplash.com/developers).",
  {
    query: z.string().describe("Search query (e.g. 'leather sofa lifestyle', 'minimalist desk setup')"),
    per_page: z.number().default(5).describe("Number of results (1-30)"),
    orientation: z
      .enum(["landscape", "portrait", "squarish"])
      .optional()
      .describe("Image orientation filter"),
    color: z
      .enum([
        "black_and_white",
        "black",
        "white",
        "yellow",
        "orange",
        "red",
        "purple",
        "magenta",
        "green",
        "teal",
        "blue",
      ])
      .optional()
      .describe("Dominant color filter"),
    order_by: z.enum(["relevant", "latest"]).default("relevant").describe("Sort order"),
  },
  async (params) => {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## Unsplash API Key Required

To search product images, set the \`UNSPLASH_ACCESS_KEY\` environment variable.

### How to get a free API key:
1. Go to https://unsplash.com/developers
2. Click "Register as a developer" (free)
3. Create a new application
4. Copy your **Access Key** (not the Secret Key)
5. Set it: \`export UNSPLASH_ACCESS_KEY="your-key-here"\`

The free tier allows 50 requests/hour — plenty for development and moderate use.`,
          },
        ],
      };
    }

    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", params.query);
    url.searchParams.set("per_page", String(Math.min(Math.max(params.per_page, 1), 30)));
    url.searchParams.set("order_by", params.order_by);
    if (params.orientation) url.searchParams.set("orientation", params.orientation);
    if (params.color) url.searchParams.set("color", params.color);

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          content: [
            {
              type: "text" as const,
              text: `Unsplash API error: ${res.status} ${res.statusText}. ${errText ? errText : "Check your UNSPLASH_ACCESS_KEY."}`,
            },
          ],
        };
      }

      const data = (await res.json()) as {
        total: number;
        total_pages: number;
        results: Array<{
          id: string;
          description?: string;
          alt_description?: string;
          urls: { raw: string; full: string; regular: string; small: string; thumb: string };
          width: number;
          height: number;
          color?: string;
          likes: number;
          user: { name: string; links: { html: string } };
          links: { download: string; download_location: string; html: string };
        }>;
      };

      if (!data.results?.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No images found for "${params.query}" on Unsplash. Try a different search term.`,
            },
          ],
        };
      }

      let text = `## Product Images for "${params.query}"\n\nFound ${data.total.toLocaleString()} image(s), showing ${data.results.length}:\n\n`;

      for (const img of data.results) {
        text += `### ${img.alt_description || img.description || "Untitled"}\n`;
        text += `- **ID**: \`${img.id}\`\n`;
        text += `- **Size**: ${img.width} x ${img.height}px\n`;
        text += `- **URLs**:\n`;
        text += `  - Thumb (200px): ${img.urls.thumb}\n`;
        text += `  - Small (400px): ${img.urls.small}\n`;
        text += `  - Regular (1080px): ${img.urls.regular}\n`;
        text += `  - Full: ${img.urls.full}\n`;
        text += `- **Photographer**: ${img.user.name} (${img.user.links.html})\n`;
        text += `- **Page**: ${img.links.html}\n`;
        if (img.color) text += `- **Dominant color**: ${img.color}\n`;
        text += `- **Likes**: ${img.likes.toLocaleString()}\n`;
        text += `\n`;
      }

      text += `---\n**Attribution required**: When using Unsplash images, credit the photographer per [Unsplash License](https://unsplash.com/license).\n`;
      text += `Example: \`Photo by [Name](profile_url) on [Unsplash](https://unsplash.com)\`\n`;

      return {
        content: [{ type: "text" as const, text: addDisclaimer(text) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to search Unsplash: ${err instanceof Error ? err.message : String(err)}. Check your network connection.`,
          },
        ],
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export { server };

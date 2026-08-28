export default {
  async fetch(request, env) {
    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key"
    };

    const json = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...CORS,
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    const url = new URL(request.url);

    // ================================
    // ENVIRONMENT VARIABLES
    // ================================

    if (!env.NOTION_TOKEN) {
      return json({
        success: false,
        error: "NOTION_TOKEN is missing"
      }, 500);
    }

    if (!env.NOTION_DATA_SOURCE_ID) {
      return json({
        success: false,
        error: "NOTION_DATA_SOURCE_ID is missing"
      }, 500);
    }

    if (!env.NOTION_MATERIALS_DATA_SOURCE_ID) {
      return json({
        success: false,
        error: "NOTION_MATERIALS_DATA_SOURCE_ID is missing"
      }, 500);
    }

    if (!env.NOTION_SERVICES_DATA_SOURCE_ID) {
      return json({
        success: false,
        error: "NOTION_SERVICES_DATA_SOURCE_ID is missing"
      }, 500);
    }

    if (!env.NOTION_CUSTOMERS_DATA_SOURCE_ID) {
      return json({
        success: false,
        error: "NOTION_CUSTOMERS_DATA_SOURCE_ID is missing"
      }, 500);
    }

    if (!env.NOTION_QUOTES_DATA_SOURCE_ID) {
      return json({
        success: false,
        error: "NOTION_QUOTES_DATA_SOURCE_ID is missing"
      }, 500);
    }

    const notionHeaders = {
      "Authorization": `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2026-03-11",
      "Content-Type": "application/json"
    };

    // ================================
    // AUTH
    // ================================

    const requireAuth = (request) => {
      if (!env.WRITE_API_KEY) {
        return json({
          success: false,
          error: "WRITE_API_KEY is missing"
        }, 500);
      }

      const key = request.headers.get("X-API-Key");

      if (!key || key !== env.WRITE_API_KEY) {
        return json({
          success: false,
          error: "Unauthorized: missing or invalid X-API-Key"
        }, 401);
      }

      return null;
    };

    try {

      // ================================
      // ROOT
      // ================================

      if (url.pathname === "/" && request.method === "GET") {
        return json({
          success: true,
          message: "Iprint API is running",
          endpoints: [
            "GET /presets",
            "POST /presets",
            "DELETE /presets?id=",
            "GET /materials",
            "GET /services",
            "GET /customers",
            "POST /customers",
            "POST /quotes",
            "POST /quotes/:id/preview"
          ]
        });
      }


      // ================================
      // PAPER PRESETS - GET
      // ================================

      if (
        url.pathname === "/presets" &&
        request.method === "GET"
      ) {

        const response = await fetch(
          `https://api.notion.com/v1/data_sources/${env.NOTION_DATA_SOURCE_ID}/query`,
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              page_size: 100
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion GET Presets Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const data = JSON.parse(text);

        const presets = (data.results || [])
          .map(page => {

            const p = page.properties || {};

            const name =
              p.Name?.title?.[0]?.plain_text ||
              p.Name?.title?.[0]?.text?.content ||
              "";

            return {
              id: page.id,
              name,
              fullW: p["Full Width"]?.number ?? 0,
              fullH: p["Full Height"]?.number ?? 0,
              usableW: p["Usable Width"]?.number ?? 0,
              usableH: p["Usable Height"]?.number ?? 0,
              type: p.Type?.select?.name || "",
              active: p.Active?.checkbox ?? false
            };
          })
          .filter(p =>
            p.name &&
            p.active === true &&
            p.fullW > 0 &&
            p.fullH > 0 &&
            p.usableW > 0 &&
            p.usableH > 0
          );

        return json({
          success: true,
          presets
        });
      }


      // ================================
      // PAPER PRESETS - POST
      // ================================

      if (
        url.pathname === "/presets" &&
        request.method === "POST"
      ) {

        const authError = requireAuth(request);

        if (authError) {
          return authError;
        }

        let body;

        try {
          body = await request.json();
        } catch (error) {
          return json({
            success: false,
            error: "Invalid JSON body"
          }, 400);
        }

        const {
          name,
          fullW,
          fullH,
          usableW,
          usableH,
          type,
          active
        } = body || {};

        if (!name) {
          return json({
            success: false,
            error: "Missing name"
          }, 400);
        }

        const response = await fetch(
          "https://api.notion.com/v1/pages",
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: {
                type: "data_source_id",
                data_source_id: env.NOTION_DATA_SOURCE_ID
              },

              properties: {

                Name: {
                  title: [
                    {
                      text: {
                        content: String(name)
                      }
                    }
                  ]
                },

                "Full Width": {
                  number: Number(fullW) || 0
                },

                "Full Height": {
                  number: Number(fullH) || 0
                },

                "Usable Width": {
                  number: Number(usableW) || 0
                },

                "Usable Height": {
                  number: Number(usableH) || 0
                },

                Type: {
                  select: type
                    ? {
                        name: String(type)
                      }
                    : null
                },

                Active: {
                  checkbox: active !== false
                }
              }
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion POST Preset Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const page = JSON.parse(text);

        return json({
          success: true,
          id: page.id
        });
      }


      // ================================
      // PAPER PRESETS - DELETE
      // ================================

      if (
        url.pathname === "/presets" &&
        request.method === "DELETE"
      ) {

        const authError = requireAuth(request);

        if (authError) {
          return authError;
        }

        const id = url.searchParams.get("id");

        if (!id) {
          return json({
            success: false,
            error: "Missing id"
          }, 400);
        }

        const response = await fetch(
          `https://api.notion.com/v1/pages/${id}`,
          {
            method: "PATCH",
            headers: notionHeaders,
            body: JSON.stringify({
              archived: true
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion DELETE Preset Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        return json({
          success: true,
          id
        });
      }


      // ================================
      // MATERIALS
      // ================================

      if (
        url.pathname === "/materials" &&
        request.method === "GET"
      ) {

        const response = await fetch(
          `https://api.notion.com/v1/data_sources/${env.NOTION_MATERIALS_DATA_SOURCE_ID}/query`,
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              page_size: 100
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion GET Materials Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const data = JSON.parse(text);

        const materials = (data.results || [])
          .map(page => {

            const p = page.properties || {};

            const name =
              p.Name?.title?.[0]?.plain_text ||
              p.Name?.title?.[0]?.text?.content ||
              "";

            return {
              id: page.id,
              name,
              material:
                p.Material?.select?.name || "",
              cost:
                p.Cost?.number ?? 0,
              price:
                p.Price?.number ?? 0,
              unit:
                p.Unit?.select?.name || "",
              active:
                p.Active?.checkbox ?? false,
              sortOrder:
                p["Sort Order"]?.number ?? 9999
            };
          })
          .filter(m =>
            m.name &&
            m.active === true
          )
          .sort((a, b) =>
            a.sortOrder - b.sortOrder
          );

        return json({
          success: true,
          materials
        });
      }


      // ================================
      // SERVICES
      // ================================

      if (
        url.pathname === "/services" &&
        request.method === "GET"
      ) {

        const response = await fetch(
          `https://api.notion.com/v1/data_sources/${env.NOTION_SERVICES_DATA_SOURCE_ID}/query`,
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              page_size: 100
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion GET Services Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const data = JSON.parse(text);

        const services = (data.results || [])
          .map(page => {

            const p = page.properties || {};

            const name =
              p.Name?.title?.[0]?.plain_text ||
              p.Name?.title?.[0]?.text?.content ||
              "";

            return {
              id: page.id,
              name,
              category:
                p.Catagory?.select?.name || "",
              material:
                p.Material?.select?.name || "",
              cost:
                p.Cost?.number ?? 0,
              price:
                p.Price?.number ?? 0,
              unit:
                p.Unit?.select?.name || "",
              active:
                p.Active?.checkbox ?? false,
              sortOrder:
                p["Sort Order"]?.number ?? 9999
            };
          })
          .filter(service =>
            service.name &&
            service.active === true
          )
          .sort((a, b) =>
            a.sortOrder - b.sortOrder
          );

        return json({
          success: true,
          services
        });
      }


      // ================================
      // CUSTOMERS - GET
      // ================================

      if (
        url.pathname === "/customers" &&
        request.method === "GET"
      ) {

        const response = await fetch(
          `https://api.notion.com/v1/data_sources/${env.NOTION_CUSTOMERS_DATA_SOURCE_ID}/query`,
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              page_size: 100
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion GET Customers Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const data = JSON.parse(text);

        const customers = (data.results || [])
          .map(page => {

            const p = page.properties || {};

            const name =
              p.Name?.title?.[0]?.plain_text ||
              p.Name?.title?.[0]?.text?.content ||
              "";

            return {
              id: page.id,

              customerId:
                p["Customer ID"]?.rich_text?.[0]?.plain_text ||
                "",

              name,

              company:
                p.Company?.rich_text?.[0]?.plain_text ||
                "",

              contactPerson:
                p["Contact Person"]?.rich_text?.[0]?.plain_text ||
                "",

              phone:
                p.Phone?.phone_number ||
                "",

              email:
                p.Email?.email ||
                "",

              taxId:
                p["Tax ID"]?.rich_text?.[0]?.plain_text ||
                "",

              branch:
                p.Branch?.rich_text?.[0]?.plain_text ||
                "",

              address:
                p.Address?.rich_text?.[0]?.plain_text ||
                "",

              billingAddress:
                p["Billing Address"]?.rich_text?.[0]?.plain_text ||
                "",

              note:
                p.Note?.rich_text?.[0]?.plain_text ||
                "",

              active:
                p.Active?.checkbox ?? false,

              createdAt:
                page.created_time || null
            };
          })
          .filter(customer =>
            customer.name &&
            customer.active === true
          );

        return json({
          success: true,
          customers
        });
      }


      // ================================
      // CUSTOMERS - CREATE
      // ================================

      if (
        url.pathname === "/customers" &&
        request.method === "POST"
      ) {

        const authError = requireAuth(request);

        if (authError) {
          return authError;
        }

        let body;

        try {
          body = await request.json();
        } catch (error) {
          return json({
            success: false,
            error: "Invalid JSON body"
          }, 400);
        }

        const {
          name,
          company,
          contactPerson,
          phone,
          email,
          taxId,
          branch,
          address,
          billingAddress,
          note
        } = body || {};

        const customerName =
          String(name || "").trim();

        if (!customerName) {
          return json({
            success: false,
            error: "Missing customer name"
          }, 400);
        }

        const customerId =
          "CUS-" +
          crypto.randomUUID()
            .replace(/-/g, "")
            .slice(0, 10)
            .toUpperCase();

        const properties = {
          Name: {
            title: [
              {
                text: {
                  content: customerName
                }
              }
            ]
          },

          "Customer ID": {
            rich_text: [
              {
                text: {
                  content: customerId
                }
              }
            ]
          },

          Company: company
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(company)
                    }
                  }
                ]
              }
            : undefined,

          "Contact Person": contactPerson
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(contactPerson)
                    }
                  }
                ]
              }
            : undefined,

          Phone: phone
            ? {
                phone_number: String(phone)
              }
            : undefined,

          Email: email
            ? {
                email: String(email)
              }
            : undefined,

          "Tax ID": taxId
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(taxId)
                    }
                  }
                ]
              }
            : undefined,

          Branch: branch
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(branch)
                    }
                  }
                ]
              }
            : undefined,

          Address: address
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(address)
                    }
                  }
                ]
              }
            : undefined,

          "Billing Address": billingAddress
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(billingAddress)
                    }
                  }
                ]
              }
            : undefined,

          Note: note
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(note)
                    }
                  }
                ]
              }
            : undefined,

          Active: {
            checkbox: true
          }
        };

        const response = await fetch(
          "https://api.notion.com/v1/pages",
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: {
                type: "data_source_id",
                data_source_id:
                  env.NOTION_CUSTOMERS_DATA_SOURCE_ID
              },

              properties
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion POST Customer Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const page = JSON.parse(text);

        return json({
          success: true,
          id: page.id,
          customerId,
          name: customerName
        });
      }


      // ================================
      // QUOTE PREVIEW - ATTACH IMAGE
      // ================================

      const previewMatch = url.pathname.match(/^\/quotes\/([^/]+)\/preview$/);

      if (previewMatch && request.method === "POST") {
        const authError = requireAuth(request);

        if (authError) {
          return authError;
        }

        let form;

        try {
          form = await request.formData();
        } catch (error) {
          return json({
            success: false,
            error: "Invalid preview upload"
          }, 400);
        }

        const image = form.get("image");
        const quoteId = previewMatch[1];

        if (!image || typeof image.arrayBuffer !== "function") {
          return json({
            success: false,
            error: "Missing preview image"
          }, 400);
        }

        if (image.type !== "image/png") {
          return json({
            success: false,
            error: "Preview image must be a PNG"
          }, 400);
        }

        if (image.size > 10 * 1024 * 1024) {
          return json({
            success: false,
            error: "Preview image exceeds the 10 MB limit"
          }, 400);
        }

        const filename = String(image.name || "quote-preview.png");

        const createUpload = await fetch(
          "https://api.notion.com/v1/file_uploads",
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              mode: "single_part",
              filename,
              content_type: "image/png"
            })
          }
        );

        const createText = await createUpload.text();

        if (!createUpload.ok) {
          return json({
            success: false,
            error: "Notion create preview upload error",
            status: createUpload.status,
            detail: createText
          }, createUpload.status);
        }

        const upload = JSON.parse(createText);
        const fileUploadId = upload.id;

        if (!fileUploadId) {
          return json({
            success: false,
            error: "Notion did not return a file upload ID"
          }, 502);
        }

        const uploadForm = new FormData();
        uploadForm.append("file", image, filename);

        const sendUpload = await fetch(
          `https://api.notion.com/v1/file_uploads/${fileUploadId}/send`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.NOTION_TOKEN}`,
              "Notion-Version": "2026-03-11"
            },
            body: uploadForm
          }
        );

        const sendText = await sendUpload.text();

        if (!sendUpload.ok) {
          return json({
            success: false,
            error: "Notion preview upload error",
            status: sendUpload.status,
            detail: sendText
          }, sendUpload.status);
        }

        const attachImage = await fetch(
          `https://api.notion.com/v1/blocks/${quoteId}/children`,
          {
            method: "PATCH",
            headers: notionHeaders,
            body: JSON.stringify({
              children: [
                {
                  object: "block",
                  type: "image",
                  image: {
                    type: "file_upload",
                    file_upload: { id: fileUploadId }
                  }
                }
              ]
            })
          }
        );

        const attachText = await attachImage.text();

        if (!attachImage.ok) {
          return json({
            success: false,
            error: "Notion attach preview error",
            status: attachImage.status,
            detail: attachText
          }, attachImage.status);
        }

        return json({
          success: true,
          quoteId,
          fileUploadId
        });
      }

      // ================================
      // QUOTES - CREATE
      // ================================

      if (
        url.pathname === "/quotes" &&
        request.method === "POST"
      ) {

        const authError = requireAuth(request);

        if (authError) {
          return authError;
        }

        let body;

        try {
          body = await request.json();
        } catch (error) {
          return json({
            success: false,
            error: "Invalid JSON body"
          }, 400);
        }

        const {
          quoteNo,
          date,
          customerPageId,
          customer,
          contact,
          address,
          items,
          total,
          sheets,
          pieceCount,
          size,
          paper
        } = body || {};

        if (!quoteNo) {
          return json({
            success: false,
            error: "Missing quoteNo"
          }, 400);
        }

        if (customer && customer !== "-" && !customerPageId) {
          return json({
            success: false,
            error:
              "customerPageId is required when customer is provided"
          }, 400);
        }

        const properties = {
          Name: {
            title: [
              {
                text: {
                  content: String(quoteNo)
                }
              }
            ]
          },

          Date: date
            ? {
                date: typeof date === "string"
                  ? { start: date }
                  : date
              }
            : undefined,

          Customer: customerPageId
            ? {
                relation: [
                  {
                    id: String(customerPageId)
                  }
                ]
              }
            : undefined,

          Contact: contact
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(contact)
                    }
                  }
                ]
              }
            : undefined,

          Address: address
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(address)
                    }
                  }
                ]
              }
            : undefined,

          Total: {
            number: Number(total) || 0
          },

          Sheets: {
            number: Number(sheets) || 0
          },

          "Piece Count": {
            number: Number(pieceCount) || 0
          },

          Size: size
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(size)
                    }
                  }
                ]
              }
            : undefined,

          Paper: paper
            ? {
                rich_text: [
                  {
                    text: {
                      content: String(paper)
                    }
                  }
                ]
              }
            : undefined,

          Items: {
            rich_text: [
              {
                text: {
                  content: JSON.stringify(items || [])
                }
              }
            ]
          }
        };

        const response = await fetch(
          "https://api.notion.com/v1/pages",
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: {
                type: "data_source_id",
                data_source_id:
                  env.NOTION_QUOTES_DATA_SOURCE_ID
              },

              properties
            })
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            success: false,
            error: "Notion POST Quotes Error",
            status: response.status,
            detail: text
          }, response.status);
        }

        const page = JSON.parse(text);

        return json({
          success: true,
          id: page.id
        });
      }


      // ================================
      // NOT FOUND
      // ================================

      return json({
        success: false,
        error: "Endpoint not found",
        endpoints: [
          "GET /presets",
          "POST /presets",
          "DELETE /presets?id=",
          "GET /materials",
          "GET /services",
          "GET /customers",
          "POST /customers",
          "POST /quotes"
        ]
      }, 404);

    } catch (error) {

      return json({
        success: false,
        error: "Worker Error",
        detail:
          error?.message ||
          String(error)
      }, 500);
    }
  }
};

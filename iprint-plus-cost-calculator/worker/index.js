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

    if (!env.NOTION_ORDER_ITEMS_DATA_SOURCE_ID) {
      return json({
        success: false,
        error: "NOTION_ORDER_ITEMS_DATA_SOURCE_ID is missing"
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
            "POST /quotes/:id/preview",
            "POST /tickets",
            "POST /orders"
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
      // ORDERS - ONE TICKET WITH MANY ORDER ITEMS
      // ================================

      if (url.pathname === "/orders" && request.method === "POST") {
        const authError = requireAuth(request);
        if (authError) return authError;
        if (!env.NOTION_TICKETS_DATA_SOURCE_ID) {
          return json({
            success: false,
            error: "NOTION_TICKETS_DATA_SOURCE_ID is missing"
          }, 500);
        }

        let form;
        try {
          form = await request.formData();
        } catch (error) {
          return json({ success: false, error: "Invalid order upload" }, 400);
        }

        const rawOrder = form.get("order");
        if (!rawOrder || typeof rawOrder !== "string") {
          return json({ success: false, error: "Missing order data" }, 400);
        }

        let order;
        try {
          order = JSON.parse(rawOrder);
        } catch (error) {
          return json({ success: false, error: "Invalid order JSON" }, 400);
        }

        const orderItems = Array.isArray(order?.orderItems)
          ? order.orderItems.filter(item => item && item.id && item.name)
          : [];
        const orderKey = String(order?.orderKey || "").trim();
        const quoteNo = String(order?.quoteNo || "").trim();

        if (!orderKey || !quoteNo) {
          return json({ success: false, error: "Missing orderKey or quoteNo" }, 400);
        }
        if (!orderItems.length || orderItems.length > 20) {
          return json({ success: false, error: "Order must contain 1-20 items" }, 400);
        }

        const resolveDataSource = async configuredId => {
          let dataSourceId = String(configuredId || "").trim();
          let response = await fetch(
            `https://api.notion.com/v1/data_sources/${dataSourceId}`,
            { method: "GET", headers: notionHeaders }
          );
          let responseText = await response.text();

          if (!response.ok && response.status === 404) {
            const databaseResponse = await fetch(
              `https://api.notion.com/v1/databases/${dataSourceId}`,
              { method: "GET", headers: notionHeaders }
            );
            const databaseText = await databaseResponse.text();

            if (databaseResponse.ok) {
              const database = JSON.parse(databaseText);
              dataSourceId = String(database?.data_sources?.[0]?.id || "").trim();
              if (dataSourceId) {
                response = await fetch(
                  `https://api.notion.com/v1/data_sources/${dataSourceId}`,
                  { method: "GET", headers: notionHeaders }
                );
                responseText = await response.text();
              }
            }
          }

          if (!response.ok) {
            throw Object.assign(new Error("Notion data source not found"), {
              status: response.status,
              detail: responseText
            });
          }

          return { id: dataSourceId, data: JSON.parse(responseText) };
        };

        let ticketsSource;
        let itemsSource;
        try {
          ticketsSource = await resolveDataSource(env.NOTION_TICKETS_DATA_SOURCE_ID);
          itemsSource = await resolveDataSource(env.NOTION_ORDER_ITEMS_DATA_SOURCE_ID);
        } catch (error) {
          return json({
            success: false,
            error: error.message || "Notion order data source error",
            detail: error.detail || null
          }, error.status || 502);
        }

        const shortText = value => String(value ?? "").slice(0, 1900);
        const richText = value => [{ type: "text", text: { content: shortText(value) } }];
        const plainText = property => (property?.rich_text || property?.title || [])
          .map(item => item?.plain_text || item?.text?.content || "")
          .join("");
        const ticketSchema = ticketsSource.data.properties || {};
        const itemSchema = itemsSource.data.properties || {};
        const ticketTitleProperty = Object.entries(ticketSchema)
          .find(([, property]) => property?.type === "title")?.[0];
        const itemTitleProperty = Object.entries(itemSchema)
          .find(([, property]) => property?.type === "title")?.[0];

        if (!ticketTitleProperty || !itemTitleProperty) {
          return json({ success: false, error: "Order database title property is missing" }, 502);
        }

        const findExisting = async (dataSourceId, property, value) => {
          const response = await fetch(
            `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
            {
              method: "POST",
              headers: notionHeaders,
              body: JSON.stringify({
                page_size: 1,
                filter: { property, rich_text: { equals: String(value) } }
              })
            }
          );
          const text = await response.text();
          if (!response.ok) {
            throw Object.assign(new Error("Notion order lookup error"), {
              status: response.status,
              detail: text
            });
          }
          return JSON.parse(text).results?.[0] || null;
        };

        let ticketPage;
        try {
          ticketPage = ticketSchema["Order Key"]?.type === "rich_text"
            ? await findExisting(ticketsSource.id, "Order Key", orderKey)
            : null;
        } catch (error) {
          return json({ success: false, error: error.message, detail: error.detail }, error.status || 502);
        }

        if (ticketPage && plainText(ticketPage.properties?.["Presentation/Proof"]) === "ORDER_READY") {
          return json({
            success: true,
            duplicate: true,
            id: ticketPage.id,
            url: ticketPage.url || null,
            itemIds: []
          });
        }

        if (!ticketPage) {
          const ticketProperties = {
            [ticketTitleProperty]: {
              title: richText(`${quoteNo} • ${order.customer || "ไม่ระบุลูกค้า"} • ${orderItems.length} รายการ`)
            }
          };
          const setTicket = (name, type, value) => {
            if (ticketSchema[name]?.type === type) ticketProperties[name] = value;
          };

          setTicket("Order Key", "rich_text", { rich_text: richText(orderKey) });
          setTicket("Order Total", "number", { number: Number(order.total) || 0 });
          setTicket("Item Count", "number", { number: orderItems.length });
          setTicket("ชื่อลูกค้า", "rich_text", { rich_text: richText(order.customer || "-") });
          setTicket("จำนวนรวม", "number", {
            number: orderItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
          });
          setTicket("ขนาด", "rich_text", { rich_text: richText(`${orderItems.length} รายการ`) });
          setTicket("สถานะ", "status", { status: { name: "NEW" } });
          setTicket("มอบหมาย", "select", { select: { name: "GRAPHIC" } });
          setTicket("งานประเภท", "select", { select: { name: "Design" } });
          setTicket("Presentation/Proof", "rich_text", { rich_text: richText("ORDER_CREATING") });

          const response = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: { type: "data_source_id", data_source_id: ticketsSource.id },
              properties: ticketProperties
            })
          });
          const text = await response.text();
          if (!response.ok) {
            return json({ success: false, error: "Notion POST Order Ticket error", detail: text }, response.status);
          }
          ticketPage = JSON.parse(text);
        }

        const ticketId = ticketPage.id;
        const itemIds = [];

        for (const [index, item] of orderItems.entries()) {
          let existingItem = null;
          try {
            existingItem = itemSchema["Item Key"]?.type === "rich_text"
              ? await findExisting(itemsSource.id, "Item Key", item.id)
              : null;
          } catch (error) {
            return json({ success: false, error: error.message, detail: error.detail, ticketId }, error.status || 502);
          }

          if (existingItem) {
            itemIds.push(existingItem.id);
            continue;
          }

          const properties = {
            [itemTitleProperty]: {
              title: richText(`#${String(index + 1).padStart(2, "0")} • ${item.name}`)
            }
          };
          const setItem = (name, type, value) => {
            if (itemSchema[name]?.type === type) properties[name] = value;
          };
          const serviceIds = (Array.isArray(item.services) ? item.services : [])
            .map(service => String(service?.id || "").trim())
            .filter(Boolean);

          setItem("Order Ticket", "relation", { relation: [{ id: ticketId }] });
          setItem("Line No", "number", { number: index + 1 });
          setItem("Item Key", "rich_text", { rich_text: richText(item.id) });
          setItem("Size", "rich_text", { rich_text: richText(item.size || "-") });
          setItem("Quantity", "number", { number: Number(item.quantity) || 0 });
          setItem("Unit", "select", { select: { name: item.unit || "ดวง" } });
          setItem("Paper", "rich_text", { rich_text: richText(item.paper?.name || "-") });
          setItem("Sheets", "number", { number: Number(item.sheets) || 0 });
          setItem("Yield", "number", { number: Number(item.yield) || 0 });
          setItem("Price", "number", { number: Number(item.price) || 0 });
          setItem("Brief", "rich_text", { rich_text: richText(item.brief || "") });
          setItem("Status", "select", { select: { name: "NEW" } });
          setItem("Material", "relation", {
            relation: item.material?.id ? [{ id: String(item.material.id) }] : []
          });
          setItem("Services", "relation", { relation: serviceIds.map(id => ({ id })) });
          setItem("Snapshot", "rich_text", {
            rich_text: richText(JSON.stringify({
              id: item.id,
              size: item.size,
              quantity: item.quantity,
              unit: item.unit,
              paper: item.paper,
              sheets: item.sheets,
              yield: item.yield,
              material: item.material,
              services: item.services,
              price: item.price,
              brief: item.brief
            }))
          });

          const response = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: { type: "data_source_id", data_source_id: itemsSource.id },
              properties
            })
          });
          const text = await response.text();
          if (!response.ok) {
            return json({
              success: false,
              error: "Notion POST Order Item error",
              detail: text,
              ticketId,
              createdItemIds: itemIds
            }, response.status);
          }
          itemIds.push(JSON.parse(text).id);
        }

        const uploadFile = async (file, fallbackFilename) => {
          if (!file || typeof file.arrayBuffer !== "function") return null;
          if (file.size > 10 * 1024 * 1024) {
            throw Object.assign(new Error("Order image exceeds the 10 MB limit"), { status: 400 });
          }
          const filename = String(file.name || fallbackFilename);
          const contentType = String(file.type || "image/png");
          const create = await fetch("https://api.notion.com/v1/file_uploads", {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({ mode: "single_part", filename, content_type: contentType })
          });
          const createText = await create.text();
          if (!create.ok) {
            throw Object.assign(new Error("Notion create order image upload error"), {
              status: create.status,
              detail: createText
            });
          }
          const uploadId = JSON.parse(createText).id;
          const uploadForm = new FormData();
          uploadForm.append("file", file, filename);
          const send = await fetch(`https://api.notion.com/v1/file_uploads/${uploadId}/send`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.NOTION_TOKEN}`,
              "Notion-Version": "2026-03-11"
            },
            body: uploadForm
          });
          const sendText = await send.text();
          if (!send.ok) {
            throw Object.assign(new Error("Notion order image upload error"), {
              status: send.status,
              detail: sendText
            });
          }
          return uploadId;
        };

        const paragraph = text => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: richText(text) }
        });
        const heading = (text, level = 2) => ({
          object: "block",
          type: `heading_${level}`,
          [`heading_${level}`]: { rich_text: richText(text) }
        });
        const imageBlock = uploadId => ({
          object: "block",
          type: "image",
          image: { type: "file_upload", file_upload: { id: uploadId } }
        });
        const children = [
          heading(`ออเดอร์ ${quoteNo}`, 1),
          paragraph(`ลูกค้า: ${shortText(order.customer || "-")} • ${orderItems.length} รายการ`),
          paragraph(`ติดต่อ: ${shortText(order.contact || "-")} • ยอดรวม ฿${Number(order.grandTotal || order.total || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`)
        ];

        try {
          const quoteUploadId = await uploadFile(form.get("quotePreview"), `${quoteNo}-quote.png`);
          if (quoteUploadId) {
            children.push(heading("ใบเสนอราคา"), imageBlock(quoteUploadId));
          }

          children.push(heading("รายการชิ้นงาน"));
          for (const [index, item] of orderItems.entries()) {
            children.push(
              heading(`#${index + 1} ${item.name}`),
              paragraph(`ขนาด ${shortText(item.size || "-")} • จำนวน ${Number(item.quantity || 0).toLocaleString("th-TH")} ${shortText(item.unit || "ดวง")}`),
              paragraph(`Preset: ${shortText(item.paper?.name || "-")} • ${Number(item.yield || 0).toLocaleString("th-TH")} ดวง/แผ่น • ใช้ ${Number(item.sheets || 0).toLocaleString("th-TH")} แผ่น`),
              paragraph(`วัสดุ: ${shortText(item.material?.name || "-")} • บริการ: ${(item.services || []).map(service => shortText(service.name)).join(", ") || "-"}`),
              paragraph(`ราคาขาย ฿${Number(item.price || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`)
            );
            if (item.brief) children.push(paragraph(`บรีฟ: ${shortText(item.brief)}`));
            const briefUploadId = await uploadFile(form.get(`brief_${index}`), `${quoteNo}-item-${index + 1}.png`);
            if (briefUploadId) children.push(imageBlock(briefUploadId));
          }

          for (let index = 0; index < children.length; index += 80) {
            const append = await fetch(`https://api.notion.com/v1/blocks/${ticketId}/children`, {
              method: "PATCH",
              headers: notionHeaders,
              body: JSON.stringify({ children: children.slice(index, index + 80) })
            });
            const appendText = await append.text();
            if (!append.ok) {
              throw Object.assign(new Error("Notion append order detail error"), {
                status: append.status,
                detail: appendText
              });
            }
          }
        } catch (error) {
          return json({
            success: false,
            error: error.message || "Notion order attachment error",
            detail: error.detail || null,
            ticketId,
            itemIds
          }, error.status || 502);
        }

        if (ticketSchema["Presentation/Proof"]?.type === "rich_text") {
          const readyResponse = await fetch(`https://api.notion.com/v1/pages/${ticketId}`, {
            method: "PATCH",
            headers: notionHeaders,
            body: JSON.stringify({
              properties: {
                "Presentation/Proof": { rich_text: richText("ORDER_READY") }
              }
            })
          });
          const readyText = await readyResponse.text();
          if (!readyResponse.ok) {
            return json({
              success: false,
              error: "Notion finalize order error",
              detail: readyText,
              ticketId,
              itemIds
            }, readyResponse.status);
          }
        }

        return json({
          success: true,
          duplicate: false,
          id: ticketId,
          url: ticketPage.url || null,
          itemIds
        });
      }


      // ================================
      // TICKETS - CREATE WITH BRIEF IMAGE
      // ================================

      if (url.pathname === "/tickets" && request.method === "POST") {
        const authError = requireAuth(request);

        if (authError) {
          return authError;
        }

        if (!env.NOTION_TICKETS_DATA_SOURCE_ID) {
          return json({
            success: false,
            error:
              "NOTION_TICKETS_DATA_SOURCE_ID is missing"
          }, 500);
        }

        let form;

        try {
          form = await request.formData();
        } catch (error) {
          return json({
            success: false,
            error: "Invalid ticket upload"
          }, 400);
        }

        const rawTicket = form.get("ticket");
        const image = form.get("image");

        if (!rawTicket || typeof rawTicket !== "string") {
          return json({
            success: false,
            error: "Missing ticket data"
          }, 400);
        }

        if (!image || typeof image.arrayBuffer !== "function") {
          return json({
            success: false,
            error: "Missing brief image"
          }, 400);
        }

        if (image.type !== "image/png") {
          return json({
            success: false,
            error: "Brief image must be a PNG"
          }, 400);
        }

        if (image.size > 10 * 1024 * 1024) {
          return json({
            success: false,
            error: "Brief image exceeds the 10 MB limit"
          }, 400);
        }

        let ticket;

        try {
          ticket = JSON.parse(rawTicket);
        } catch (error) {
          return json({
            success: false,
            error: "Invalid ticket JSON"
          }, 400);
        }

        const ticketTitle = String(ticket?.title || "").trim();
        const extras = Array.isArray(ticket?.extras)
          ? ticket.extras.filter(item => item && item.name)
          : [];

        if (!ticketTitle) {
          return json({
            success: false,
            error: "Missing ticket title"
          }, 400);
        }

        let ticketDataSourceId = String(
          env.NOTION_TICKETS_DATA_SOURCE_ID
        ).trim();
        let dataSourceResponse = await fetch(
          `https://api.notion.com/v1/data_sources/${ticketDataSourceId}`,
          {
            method: "GET",
            headers: notionHeaders
          }
        );
        let dataSourceText = await dataSourceResponse.text();

        // Notion database URLs expose a database ID, not a data source ID.
        // Accept either value so the Worker can resolve the first table
        // automatically when a database ID was configured.
        if (!dataSourceResponse.ok && dataSourceResponse.status === 404) {
          const databaseResponse = await fetch(
            `https://api.notion.com/v1/databases/${ticketDataSourceId}`,
            {
              method: "GET",
              headers: notionHeaders
            }
          );
          const databaseText = await databaseResponse.text();

          if (databaseResponse.ok) {
            const database = JSON.parse(databaseText);
            const resolvedDataSourceId = String(
              database?.data_sources?.[0]?.id || ""
            ).trim();

            if (!resolvedDataSourceId) {
              return json({
                success: false,
                error: "Ticket database has no data source"
              }, 502);
            }

            ticketDataSourceId = resolvedDataSourceId;
            dataSourceResponse = await fetch(
              `https://api.notion.com/v1/data_sources/${ticketDataSourceId}`,
              {
                method: "GET",
                headers: notionHeaders
              }
            );
            dataSourceText = await dataSourceResponse.text();
          }
        }

        if (!dataSourceResponse.ok) {
          return json({
            success: false,
            error: "Notion GET Tickets data source error",
            status: dataSourceResponse.status,
            detail: dataSourceText
          }, dataSourceResponse.status);
        }

        const dataSource = JSON.parse(dataSourceText);
        const titleProperty = Object.entries(
          dataSource.properties || {}
        ).find(([, property]) => property?.type === "title");

        if (!titleProperty) {
          return json({
            success: false,
            error: "Ticket data source has no title property"
          }, 502);
        }

        const [titlePropertyName] = titleProperty;
        const shortText = value => String(value ?? "").slice(0, 1900);
        const richText = value => [{
          type: "text",
          text: { content: shortText(value) }
        }];
        const ticketProperties = {
          [titlePropertyName]: {
            title: richText(ticketTitle)
          }
        };
        const sourceProperties = dataSource.properties || {};
        const setTicketProperty = (name, expectedType, value) => {
          if (sourceProperties[name]?.type === expectedType && value !== undefined) {
            ticketProperties[name] = value;
          }
        };
        const materialPageIds = [...new Set(extras
          .filter(item => item.kind === "วัสดุ" && item.pageId)
          .map(item => String(item.pageId))
        )];
        const servicePageIds = [...new Set(extras
          .filter(item => item.kind === "บริการเพิ่มเติม" && item.pageId)
          .map(item => String(item.pageId))
        )];

        setTicketProperty("ขนาด", "rich_text", {
          rich_text: richText(ticket.size || "-")
        });
        setTicketProperty("จำนวนรวม", "number", {
          number: Number(ticket.pieceCount) || 0
        });
        setTicketProperty("อธิบายเพิ่ม", "rich_text", {
          rich_text: richText(ticket.graphicBriefDescription || "")
        });
        setTicketProperty("สถานะ", "status", {
          status: { name: "NEW" }
        });
        setTicketProperty("มอบหมาย", "select", {
          select: { name: "GRAPHIC" }
        });
        setTicketProperty("งานประเภท", "select", {
          select: { name: "Design" }
        });
        setTicketProperty("ไฟล์ประเภท", "multi_select", {
          multi_select: [
            { name: "ทำแบบ" },
            { name: "ส่งให้ตรวจก่อน" }
          ]
        });
        setTicketProperty("วัสดุที่ใช้", "relation", {
          relation: materialPageIds.map(id => ({ id }))
        });
        setTicketProperty("บริการที่ใช้", "relation", {
          relation: servicePageIds.map(id => ({ id }))
        });

        const createTicket = await fetch(
          "https://api.notion.com/v1/pages",
          {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: {
                type: "data_source_id",
                data_source_id: ticketDataSourceId
              },
              properties: ticketProperties
            })
          }
        );
        const createTicketText = await createTicket.text();

        if (!createTicket.ok) {
          return json({
            success: false,
            error: "Notion POST Ticket error",
            status: createTicket.status,
            detail: createTicketText
          }, createTicket.status);
        }

        const ticketPage = JSON.parse(createTicketText);
        const ticketId = ticketPage.id;
        const uploadImageToNotion = async (file, fallbackFilename) => {
          const filename = String(file.name || fallbackFilename);
          const contentType = String(file.type || "image/png");
          const createUpload = await fetch(
            "https://api.notion.com/v1/file_uploads",
            {
              method: "POST",
              headers: notionHeaders,
              body: JSON.stringify({
                mode: "single_part",
                filename,
                content_type: contentType
              })
            }
          );
          const createUploadText = await createUpload.text();

          if (!createUpload.ok) {
            throw Object.assign(new Error("Notion create image upload error"), {
              status: createUpload.status,
              detail: createUploadText
            });
          }

          const fileUpload = JSON.parse(createUploadText);
          const fileUploadId = fileUpload.id;

          if (!fileUploadId) {
            throw new Error("Notion did not return an image upload ID");
          }

          const uploadForm = new FormData();
          uploadForm.append("file", file, filename);
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
          const sendUploadText = await sendUpload.text();

          if (!sendUpload.ok) {
            throw Object.assign(new Error("Notion image upload error"), {
              status: sendUpload.status,
              detail: sendUploadText
            });
          }

          return { id: fileUploadId, filename };
        };

        let briefUpload;

        try {
          briefUpload = await uploadImageToNotion(image, "iprint-brief.png");
        } catch (error) {
          return json({
            success: false,
            error: error.message || "Notion ticket image upload error",
            status: error.status || 502,
            detail: error.detail || null,
            ticketId
          }, error.status || 502);
        }

        const fileUploadId = briefUpload.id;

        const graphicBriefDescription = String(ticket.graphicBriefDescription || "")
          .trim()
          .slice(0, 1900);
        const paragraph = text => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: richText(text) }
        });
        const heading = text => ({
          object: "block",
          type: "heading_2",
          heading_2: { rich_text: richText(text) }
        });
        const bullet = text => ({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: richText(text) }
        });
        const number = value => Number(value || 0).toLocaleString("th-TH", {
          maximumFractionDigits: 2
        });
        const children = [
          heading("สรุปบรีฟงาน"),
          paragraph(`Preset: ${shortText(ticket.paper || "-")}`),
          paragraph(`ขนาดชิ้นงาน: ${shortText(ticket.size || "-")} • จำนวน ${number(ticket.pieceCount)} ชิ้นงาน`),
          paragraph(`การผลิต: ${number(ticket.yield)} ดวง/แผ่น • ใช้ ${number(ticket.sheets)} แผ่น`),
          ...(graphicBriefDescription
            ? [heading("คำอธิบายสำหรับแผนกกราฟิก"), paragraph(graphicBriefDescription)]
            : []),
          {
            object: "block",
            type: "image",
            image: {
              type: "file_upload",
              file_upload: { id: fileUploadId }
            }
          },
          heading("วัสดุและบริการเพิ่มเติม")
        ];

        if (extras.length) {
          extras.forEach(item => {
            children.push(bullet(
              `${shortText(item.kind || "รายการ")}: ${shortText(item.name)} • ${number(item.quantity)} ${shortText(item.unit || "หน่วย")} • รวม ฿${number(item.total)}`
            ));
          });
        } else {
          children.push(paragraph("ยังไม่ได้เลือกวัสดุหรือบริการเพิ่มเติม"));
        }

        const appendBlocks = await fetch(
          `https://api.notion.com/v1/blocks/${ticketId}/children`,
          {
            method: "PATCH",
            headers: notionHeaders,
            body: JSON.stringify({ children })
          }
        );
        const appendBlocksText = await appendBlocks.text();

        if (!appendBlocks.ok) {
          return json({
            success: false,
            error: "Notion attach ticket detail error",
            status: appendBlocks.status,
            detail: appendBlocksText,
            ticketId
          }, appendBlocks.status);
        }

        return json({
          success: true,
          id: ticketId,
          url: ticketPage.url || null,
          fileUploadId
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
          "POST /quotes",
          "POST /quotes/:id/preview",
          "POST /orders",
          "POST /tickets"
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

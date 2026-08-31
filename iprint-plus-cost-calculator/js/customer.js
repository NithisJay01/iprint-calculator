async function syncCustomers() {
    const input = $('quoteCustomer');
    const list = $('quoteCustomerList');

    if (!input || !list) return;

    try {
      const data = await getJSON(API.customers);

      customers = Array.isArray(data.customers)
        ? data.customers
        : [];

      cachePut('iprint_cache_customers_v1', customers);
      renderCustomerOptions();

      setStatus(
        'customerStatus',
        'Notion • ' + customers.length + ' ลูกค้า',
        'ok'
      );
    } catch (error) {
      const cached = cacheGet('iprint_cache_customers_v1');

      if (cached) {
        customers = cached.data || [];
        renderCustomerOptions();

        setCachedStatus(
          'customerStatus',
          'ใช้ Customer จาก Cache',
          cached.timestamp
        );
      } else {
        customers = [];
        renderCustomerOptions();

        setStatus(
          'customerStatus',
          'ยังไม่มีข้อมูล Customer • พิมพ์ชื่อเพื่อสร้างใหม่',
          'warn'
        );
      }

      console.error('GET /customers', error);
    }
  }

function renderCustomerOptions() {
    const list = $('quoteCustomerList');
    if (!list) return;

    list.innerHTML = '';

    customers
      .filter(customer => customer && customer.active !== false)
      .forEach(customer => {
        const option = document.createElement('option');

        option.value = String(customer.name || '');

        if (customer.company) {
          option.label = String(customer.company);
        }

        list.appendChild(option);
      });
  }

function findCustomerByInput(value) {
    const keyword = String(value || '').trim().toLowerCase();

    if (!keyword) return null;

    return customers.find(customer => {
      const name = String(customer.name || '').trim().toLowerCase();
      const company = String(customer.company || '').trim().toLowerCase();
      const phone = String(customer.phone || '').trim().toLowerCase();

      return keyword === name || keyword === company || keyword === phone;
    }) || null;
  }

function selectQuoteCustomer() {
    const input = $('quoteCustomer');
    const pageIdInput = $('quoteCustomerPageId');
    const value = input.value.trim();
    const customer = findCustomerByInput(value);

    if (!value) {
      pageIdInput.value = '';

      setStatus(
        'customerStatus',
        'เลือกลูกค้าเก่า หรือพิมพ์ชื่อเพื่อสร้างใหม่',
        ''
      );

      buildQuote();
      return;
    }

    if (customer) {
      pageIdInput.value = customer.id;

      if ($('quotePhone')) $('quotePhone').value = customer.phone || '';
      if ($('quoteContact')) $('quoteContact').value = customer.email || '';

      if (customer.address) {
        $('quoteAddress').value = customer.address;
      }

      if ($('quoteTaxId')) {
        $('quoteTaxId').value = customer.taxId || '';
      }

      setStatus(
        'customerStatus',
        'ลูกค้าเดิม • ' + customer.name,
        'ok'
      );
    } else {
      pageIdInput.value = '';

      setStatus(
        'customerStatus',
        'ลูกค้าใหม่ • จะสร้าง Customer อัตโนมัติเมื่อบันทึกใบเสนอราคา',
        'warn'
      );
    }

    buildQuote();
  }

async function ensureQuoteCustomer(q) {
    const input = $('quoteCustomer');
    const existingId = $('quoteCustomerPageId').value.trim();
    const name = input.value.trim();

    if (existingId || !name) {
      return q;
    }

    const customerData = {
      name,
      contactPerson: q.recipient || '',
      phone: q.phone || '',
      email: q.email || '',
      taxId: q.taxId || '',
      address: q.address || '',
      active: true
    };

    setStatus(
      'customerStatus',
      'กำลังสร้าง Customer ใหม่…',
      ''
    );

    const created = await createCustomerRemote(customerData);

    if (!created) {
      setStatus(
        'customerStatus',
        'สร้าง Customer ไม่สำเร็จ • แต่ยังพิมพ์ใบเสนอราคาได้',
        'warn'
      );

      return q;
    }

    const customerPageId = String(created.id);

    $('quoteCustomerPageId').value = customerPageId;

    customers.push({
      id: customerPageId,
      name,
      company: '',
      contactPerson: '',
      phone: q.phone || '',
      email: q.email || '',
      address: q.address || '',
      active: true
    });

    renderCustomerOptions();

    setStatus(
      'customerStatus',
      'สร้าง Customer ใหม่แล้ว',
      'ok'
    );

    q.customerPageId = customerPageId;

    return q;
  }

(function (global) {
  'use strict';

  var sequence = 0;
  var NAME_KEYS = ['фио', 'фамилияимяотчество', 'полноеимя', 'имягостя', 'гость', 'приглашаемый', 'приглашаемая', 'name', 'fullname', 'guest', 'guestname', 'fio'];
  var FIRST_KEYS = ['имя', 'firstname', 'givenname'];
  var LAST_KEYS = ['фамилия', 'lastname', 'surname', 'familyname'];
  var MIDDLE_KEYS = ['отчество', 'middlename', 'patronymic'];
  var GENDER_KEYS = ['пол', 'gender', 'sex'];
  var EMAIL_KEYS = ['email', 'emailaddress', 'электроннаяпочта', 'элпочта', 'почта', 'адресэлектроннойпочты'];
  var MALE_NAMES = ('август авдей адам адриан азамат айдар аким александр алексей альберт амир анатолий андрей антон ануар аркадий арсен арсений артем артемий артур архип афанасий ахмет богдан борис вадим валентин валерий василий вениамин викентий виктор вильгельм виталий владимир владислав всеволод вячеслав гавриил геннадий георгий герман глеб гордей григорий давид дамир даниил данил данила демид денис дмитрий евгений евдоким егор елисей емельян ефим захар игнат игнатий игорь иван ильдар илья иннокентий иосиф ипполит ирек искандер камиль карен кирилл клим климентий константин корней лев леон леонид лука лукьян магомед макар максим марат марк марсель матвей мирон мирослав михаил назар никита николай олег осип павел петр платон прохор рамиль рафаэль рашид ринат роберт родион роман ростислав руслан рустам савва савелий святослав семен серафим сергей станислав степан султан тарас тахир тимофей тимур тихон федор феликс филипп харитон эдуард эльдар эмиль эрик юлиан юрий яков ян ярослав').split(' ');
  var FEMALE_NAMES = ('авдотья аврора агата агния ада аделина азалия аксинья алевтина александра алена алина алиса алия алла альбина амалия амина анастасия ангелина анжела анжелика анна антонина анфиса арина ася аэлита белла богдана божена валентина валерия варвара василина василиса венера вера вероника виктория вилена виолетта виталина влада владислава галина гелена гелла глория дарина дарья диана дина динара ева евгения евдокия екатерина елена елизавета жанна жасмин зинаида злата зоя зульфия иветта изабелла илона инга инесса инна иоанна ирина камилла карина каролина кира клавдия клара кристина ксения лада лариса лейла лера лиана лидия лилия лина любовь людмила майя маргарита марианна марина мария марта марфа милана милена мила мирослава надежда наталия наталья нелли ника николь нина нинель нонна оксана октавия олеся ольга пелагея полина прасковья рада раиса регина рената римма рита роза розалия руслана сабина светлана серафима снежана софия софья стелла сусанна таисия тамара татьяна ульяна фаина флора христина эвелина элеонора элина элла эльвира эльза эмилия эмма юлия юлиана яна янина ярослава').split(' ');
  var AMBIGUOUS_NAMES = ['саша', 'женя', 'валя', 'шура', 'слава', 'саня', 'алекс', 'ника'];

  function clean(value) {
    return value == null ? '' : String(value).replace(/\u0000/g, '').trim();
  }

  function nameText(value) {
    return clean(value).replace(/\s+/g, ' ');
  }

  function key(value) {
    return clean(value).toLowerCase().replace(/ё/g, 'е').replace(/[\s._\-()\/]+/g, '');
  }

  function explicitGender(value) {
    if (/^[-–—]$/.test(clean(value))) return 'neutral';
    var normalized = key(value);
    if (['м', 'm', 'male', 'man', 'муж', 'мужчина', 'мужской', 'мужскойпол'].indexOf(normalized) !== -1) return 'male';
    if (['ж', 'f', 'female', 'woman', 'жен', 'женщина', 'женский', 'женскийпол'].indexOf(normalized) !== -1) return 'female';
    if (['н', 'n', 'neutral', 'none', 'unspecified', 'неуказан', 'неуказано', 'неопределен', 'неопределено', 'нейтральный', 'безпола', 'другое', '-', '—', '–'].indexOf(normalized) !== -1) return 'neutral';
    return null;
  }

  function inferGenderDetails(name) {
    var words = nameText(name).toLowerCase().replace(/ё/g, 'е').match(/[а-я]+(?:-[а-я]+)*/g) || [];
    var signals = [];
    words.forEach(function (word, index) {
      word.split('-').forEach(function (part) {
        if (/(?:овна|евна|ична|инична)$/.test(part)) signals.push({gender: 'female', reason: 'patronymic', confidence: 0.98});
        else if (words.length >= 3 && index > 0 && part.length >= 5 && /ич$/.test(part)) signals.push({gender: 'male', reason: 'patronymic', confidence: 0.98});
        if (AMBIGUOUS_NAMES.indexOf(part) !== -1) return;
        if (MALE_NAMES.indexOf(part) !== -1) signals.push({gender: 'male', reason: 'first-name', confidence: 0.92});
        else if (FEMALE_NAMES.indexOf(part) !== -1) signals.push({gender: 'female', reason: 'first-name', confidence: 0.92});
        // Surname endings are evidence only for a name-shaped token, never a
        // generic final "а/я" rule (Никита, Илья, Лука and other names need it).
        else if (part.length >= 4 && /(?:ова|ева|ина|ына|ская|цкая|ая)$/.test(part)) signals.push({gender: 'female', reason: 'surname', confidence: 0.72});
        else if (part.length >= 4 && /(?:ов|ев|ин|ын|ский|цкий|ый|ой)$/.test(part)) signals.push({gender: 'male', reason: 'surname', confidence: 0.72});
      });
    });
    if (!signals.length) return {gender: 'neutral', reason: 'unknown', confidence: 0};
    if (signals.some(function (signal) { return signal.gender !== signals[0].gender; })) return {gender: 'neutral', reason: 'conflict', confidence: 0};
    return signals.sort(function (a, b) { return b.confidence - a.confidence; })[0];
  }

  function inferGender(name) {
    return inferGenderDetails(name).gender;
  }

  function normalizeGender(value, name) {
    return clean(value) ? (explicitGender(value) || 'neutral') : inferGender(name);
  }

  function makeId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    sequence += 1;
    return 'guest-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function createGuest(name, gender, email, genderMode) {
    var fullName = nameText(name);
    var mode = genderMode === 'auto' || genderMode === 'manual' ? genderMode : (clean(gender) ? 'manual' : 'auto');
    return { id: makeId(), name: fullName, gender: mode === 'auto' ? inferGender(fullName) : (explicitGender(gender) || 'neutral'), genderMode: mode, email: clean(email) };
  }

  function findIndex(headers, variants) {
    for (var i = 0; i < headers.length; i += 1) {
      if (variants.indexOf(headers[i]) !== -1) return i;
    }
    return -1;
  }

  function schemaFor(headers) {
    return {
      name: findIndex(headers, NAME_KEYS),
      first: findIndex(headers, FIRST_KEYS),
      last: findIndex(headers, LAST_KEYS),
      middle: findIndex(headers, MIDDLE_KEYS),
      gender: findIndex(headers, GENDER_KEYS),
      email: findIndex(headers, EMAIL_KEYS)
    };
  }

  function isHeader(schema) {
    return schema.name >= 0 || schema.first >= 0 || schema.last >= 0 || schema.middle >= 0 || schema.gender >= 0 || schema.email >= 0;
  }

  function field(row, index) {
    return index >= 0 ? row[index] : '';
  }

  function nameFromRow(row, schema) {
    if (schema.name >= 0) return field(row, schema.name);
    return [field(row, schema.last), field(row, schema.first), field(row, schema.middle)].map(nameText).filter(Boolean).join(' ');
  }

  // RFC-style field reader. Both CRLF and LF are accepted, including quoted line breaks.
  function readRows(text, delimiter, warnings) {
    var rows = [];
    var row = [];
    var value = '';
    var quoted = false;
    var afterQuote = false;
    var line = 1;
    var startLine = 1;
    var badQuoteReported = false;

    function endField() {
      row.push(value);
      value = '';
      afterQuote = false;
      badQuoteReported = false;
    }

    function endRow() {
      endField();
      if (row.some(function (cell) { return clean(cell) !== ''; })) rows.push({ cells: row, line: startLine });
      row = [];
      startLine = line + 1;
    }

    for (var i = 0; i < text.length; i += 1) {
      var char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { value += '"'; i += 1; }
          else { quoted = false; afterQuote = true; }
        } else if (char === '\r' || char === '\n') {
          value += '\n';
          if (char === '\r' && text[i + 1] === '\n') i += 1;
          line += 1;
        } else value += char;
      } else if (char === delimiter) {
        endField();
      } else if (char === '\r' || char === '\n') {
        endRow();
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        line += 1;
      } else if (char === '"' && value === '' && !afterQuote) {
        quoted = true;
      } else {
        if (afterQuote && !/\s/.test(char) && !badQuoteReported) {
          warnings.push('Строка ' + line + ': после закрывающей кавычки есть лишние символы. Проверьте значение.');
          badQuoteReported = true;
        }
        // Spaces after a closing quote are harmless; spaces inside a quoted field are retained.
        if (!afterQuote || !/\s/.test(char)) value += char;
      }
    }
    if (quoted) warnings.push('Строка ' + startLine + ': не закрыта кавычка. Проверьте импортированную запись.');
    if (value || row.length) endRow();
    return rows;
  }

  function delimiterFor(text, format) {
    if (format === 'tsv') return '\t';
    var candidates = [';', '\t', ','];
    var counts = [0, 0, 0];
    var quoted = false;
    var lines = 0;
    for (var i = 0; i < text.length && lines < 12; i += 1) {
      var char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted) {
        var index = candidates.indexOf(char);
        if (index >= 0) counts[index] += 1;
        if (char === '\n') lines += 1;
      }
    }
    var largest = Math.max.apply(Math, counts);
    return largest ? candidates[counts.indexOf(largest)] : ';';
  }

  function parse(text, format) {
    var source = clean(text).replace(/^\uFEFF/, '');
    var type = clean(format || 'auto').toLowerCase().replace(/^\./, '');
    var guests = [];
    var warnings = [];
    var seenIds = Object.create(null);
    if (!source) return { guests: guests, warnings: warnings };

    function add(name, gender, email, line, originalId, genderMode) {
      if (name != null && typeof name === 'object') {
        warnings.push('Строка ' + line + ': имя гостя должно быть текстом; запись пропущена.');
        return;
      }
      var fullName = nameText(name).replace(/^(?:\d{1,5}[.)]\s+|[•●▪◦]\s*|[-–—]\s+)/, '');
      if (!fullName) {
        warnings.push('Строка ' + line + ': нет имени гостя; запись пропущена.');
        return;
      }
      var guest = createGuest(fullName, gender, email, genderMode);
      var id = clean(originalId);
      if (id && !seenIds[id]) guest.id = id;
      seenIds[guest.id] = true;
      if (clean(gender) && explicitGender(gender) === null) {
        warnings.push('Строка ' + line + ': неизвестный пол «' + clean(gender).slice(0, 80) + '» у «' + fullName + '». Выбрано нейтральное обращение.');
      } else if (!clean(gender) && guest.gender === 'neutral') {
        warnings.push('Строка ' + line + ': пол гостя «' + fullName + '» не определён. Выбрано нейтральное обращение.');
      }
      if (guest.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) {
        warnings.push('Строка ' + line + ': проверьте адрес электронной почты «' + guest.email.slice(0, 120) + '».');
      }
      guests.push(guest);
    }

    if (type === 'json' || (type === 'auto' && /^[\[{]/.test(source))) {
      var data;
      try { data = JSON.parse(source); }
      catch (error) {
        return { guests: [], warnings: ['Не удалось прочитать JSON: ' + error.message] };
      }
      if (data && !Array.isArray(data) && Array.isArray(data.guests)) data = data.guests;
      if (!Array.isArray(data)) return { guests: [], warnings: ['JSON должен содержать массив гостей или объект с массивом guests.'] };
      data.forEach(function (item, index) {
        if (typeof item === 'string') { if (clean(item)) add(item, '', '', index + 1); return; }
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          warnings.push('Запись ' + (index + 1) + ': ожидалось имя или объект гостя; запись пропущена.');
          return;
        }
        var keys = Object.keys(item);
        var cells = keys.map(function (itemKey) { return item[itemKey]; });
        var schema = schemaFor(keys.map(key));
        add(nameFromRow(cells, schema), field(cells, schema.gender), field(cells, schema.email), index + 1, item.id, item.genderMode);
      });
      return { guests: guests, warnings: warnings };
    }

    if (['text', 'txt', 'plain'].indexOf(type) !== -1) {
      source.split(/\r\n|\r|\n/).forEach(function (name, index) { if (clean(name)) add(name, '', '', index + 1); });
      return { guests: guests, warnings: warnings };
    }

    var separatorHint = /^sep=(;|,|\t)\r?\n/i.exec(source);
    var delimiter = separatorHint ? separatorHint[1] : delimiterFor(source, type);
    if (separatorHint) source = source.slice(separatorHint[0].length);
    var rows = readRows(source, delimiter, warnings);
    if (!rows.length) return { guests: guests, warnings: warnings };
    var header = schemaFor(rows[0].cells.map(key));
    var hasHeader = isHeader(header);
    if (hasHeader && header.name < 0 && header.first < 0 && header.last < 0 && header.middle < 0) {
      return { guests: [], warnings: warnings.concat('В заголовке не найден столбец ФИО / Имя / Name. Добавьте название столбца с именами.') };
    }
    rows.slice(hasHeader ? 1 : 0).forEach(function (row) {
      var cells = row.cells;
      if (hasHeader) {
        add(nameFromRow(cells, header), field(cells, header.gender), field(cells, header.email), row.line);
      } else {
        // A headerless Excel range can contain Фамилия | Имя | Отчество.
        // Recognize this narrowly; an explicit gender/email column still wins.
        var splitName = cells.length === 3 && !/\s/.test(clean(cells[0])) && !/@/.test(cells.join(' ')) && explicitGender(cells[1]) === null && /(?:ович|евич|ич|овна|евна|ична)$/i.test(clean(cells[2]));
        var twoPartName = cells.length === 2 && !/\s/.test(clean(cells[0])) && explicitGender(cells[1]) === null && (MALE_NAMES.indexOf(clean(cells[1]).toLowerCase().replace(/ё/g, 'е')) !== -1 || FEMALE_NAMES.indexOf(clean(cells[1]).toLowerCase().replace(/ё/g, 'е')) !== -1);
        if (splitName || twoPartName) { add(cells.join(' '), '', '', row.line); return; }
        // For a two-column list, an email address can take the place of gender.
        var emailSecond = cells.length === 2 && /@/.test(clean(cells[1]));
        add(cells[0], emailSecond ? '' : cells[1], emailSecond ? cells[1] : cells[2], row.line);
        if (cells.length > 3) warnings.push('Строка ' + row.line + ': столбцы после третьего не использованы. Добавьте заголовок для явного выбора ФИО, пола и почты.');
      }
    });
    return { guests: guests, warnings: warnings };
  }

  function safeCSV(value) {
    var text = clean(value);
    // A leading apostrophe makes formula-looking input literal in Excel and LibreOffice.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCSV(guests) {
    var rows = [['ФИО', 'Пол', 'Email']];
    (Array.isArray(guests) ? guests : []).forEach(function (guest) {
      if (!guest || !nameText(guest.name)) return;
      var gender = normalizeGender(guest.gender, guest.name);
      rows.push([nameText(guest.name), gender === 'male' ? 'М' : gender === 'female' ? 'Ж' : 'не указан', clean(guest.email)]);
    });
    return '\uFEFF' + rows.map(function (row) { return row.map(safeCSV).join(';'); }).join('\r\n') + '\r\n';
  }

  function toJSON(guests) {
    return JSON.stringify((Array.isArray(guests) ? guests : []).filter(function (guest) {
      return guest && nameText(guest.name);
    }).map(function (guest) {
      var mode = guest.genderMode === 'auto' ? 'auto' : 'manual';
      return { id: clean(guest.id) || makeId(), name: nameText(guest.name), gender: mode === 'auto' ? inferGender(guest.name) : normalizeGender(guest.gender, guest.name), genderMode: mode, email: clean(guest.email) };
    }), null, 2);
  }

  global.GuestData = Object.freeze({ parse: parse, toCSV: toCSV, toJSON: toJSON, normalizeGender: normalizeGender, inferGender: inferGender, inferGenderDetails: inferGenderDetails, createGuest: createGuest });
})(typeof window !== 'undefined' ? window : globalThis);

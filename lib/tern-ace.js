ace.define('ace/autocomplete/tern_completer', [ 'require', 'exports', 'module',
    'ace/ext/language_tools' ], function(require, exports, module) {

  var server = null;
  exports.setServer = function(s) {
    server = s;
  }

  function showError(cm, msg) {
    
  }
  
  function startsWith(str, token) {
    return str.slice(0, token.length).toUpperCase() == token.toUpperCase();
  }
  
  function getSnippet(completion) {
    var text = completion.name;
    var type = completion.type;
    var firstParam = null, currentParam = null, typeParsing = false, nbParams = 0;
    if (startsWith(type, 'fn(')) {
      text += '(';
      var bracket = 0;
      var afterStartFn = type.substring(2, type.length);
      var i = 0;
      for (i = 0; i < afterStartFn.length; i++) {
        var c = afterStartFn.charAt(i);
        switch (c) {
        case '(':
          bracket++;
          break;
        case ')':
          bracket--;
          break;
        default:
          if (bracket == 1) {
            if (typeParsing) {
              if (c == ',')
                typeParsing = false;
            } else {
              if (currentParam == null) {
                if (c != ' ' && c != '?') {
                  currentParam = c;
                }
              } else {
                if (c == ':') {
                  typeParsing = true;
                  if (firstParam == null) {
                    firstParam = currentParam;
                  } else {
                    text += ', ';
                  }
                  nbParams++;
                  text += '${';
                  text += nbParams;
                  text += ':';
                  text += currentParam;
                  text += '}';
                  currentParam = null;                  
                } else {
                  if (c != ' ' && c != '?') {
                    currentParam += c;
                  }
                }
              }
            }
          }
        }
        if (bracket == 0)
          break;
      }
      text += ')';
    }
    return text;
  }
  
  exports.getCompletions = function(editor, session, pos, prefix, callback) {
    if (!server) {
      return;
    }
    server.request(editor, {type: "completions", types: true, origins: true}, function(error, data) {
      if (error) return; showError(editor, error);
      callback(null, data.completions.map(function(item) {
        return {
            caption: item.name,
            snippet: getSnippet(item),
            score: 1,
            meta: item.origin ? item.origin : "tern"
        };
      }));      
    });
  };

});

ace.define('tern/server', [ 'require', 'exports', 'module' ], function(require,
    exports, module) {

  var server = null, defs = [], plugins = {}, docs = Object.create(null), responseFilter = null, cachedArgHints = null;

  exports.addDef = function(def) {
    defs.push(def);
  }

  exports.setDefs = function(d) {
    defs = d;
  }
 
  exports.setPlugins = function(p) {
    plugins = p;
  }
  
  exports.responseFilter = function(f) {
    responseFilter = f;
  }
  
  exports.request = function(editor, query, c, pos) {
    var server = getServer();
    var doc = findDoc(editor);
    var request = buildRequest(doc, query, pos);
    
    server.request(request, function(error, data) {
      if (!error && responseFilter) data = responseFilter(doc, query, request, error, data);
      c(error, data);
    });
  }
  
  function trackChange(e, editor) {
    var data = findDoc(editor);
    
    var argHints = cachedArgHints;
    //TODO
    //if (argHints && argHints.doc == doc && cmpPos(argHints.start, change.to) <= 0)
    //  cachedArgHints = null;
  }
  
  function findDoc(editor, name) {
    for (var n in docs) {
      var cur = docs[n];
      if (cur.doc == editor) return cur;
    }
    if (!name) for (var i = 0;; ++i) {
      n = "[doc" + (i || "") + "]";
      if (!docs[n]) { name = n; break; }
    }
    return addDoc(name, editor);
  }

  function addDoc(name, editor) {
    var data = {doc: editor, name: name, changed: null};
    server.addFile(name, docValue(data));
    editor.on("change", trackChange);
    return docs[name] = data;
  }
  
  function docValue(doc) {
    var val = doc.doc.getValue();
    //if (ts.options.fileFilter) val = ts.options.fileFilter(val, doc.name, doc.doc);
    return val;
  }
  
  function getServer() {
    if (!server) {
      server = new tern.Server({
        getFile : function(name, c) {
          return getFile(self, name, c);
        },
        async : true,
        defs : defs,
        plugins : plugins
      });
    }
    return server;
  }

  function buildRequest(doc, query, pos) {
    var files = [], offsetLines = 0, allowFragments = !query.fullDocs;
    if (!allowFragments)
      delete query.fullDocs;
    if (typeof query == "string")
      query = {
        type : query
      };
    query.lineCharPositions = true;
    if (query.end == null) {
      query.end = pos || {line: doc.doc.getCursorPosition().row, ch: doc.doc.getCursorPosition().column};
      // TODO
      //if (doc.doc.somethingSelected())
      //  query.start = doc.doc.getCursor("start");
    }
    var startPos = query.start || query.end;

    // TODO
    doc.changed = true;
    if (doc.changed) {
      /*if (doc.doc.lineCount() > bigDoc && allowFragments !== false
          && doc.changed.to - doc.changed.from < 100
          && doc.changed.from <= startPos.line
          && doc.changed.to > query.end.line) {
        files.push(getFragmentAround(doc, startPos, query.end));
        query.file = "#0";
        var offsetLines = files[0].offsetLines;
        if (query.start != null)
          query.start = Pos(query.start.line - -offsetLines, query.start.ch);
        query.end = Pos(query.end.line - offsetLines, query.end.ch);
      } else {*/
        files.push({
          type : "full",
          name : doc.name,
          text : docValue(doc)
        });
        query.file = doc.name;
        doc.changed = null;
      //}
    } else {
      query.file = doc.name;
    }
    for ( var name in docs) {
      var cur = docs[name];
      if (cur.changed && cur != doc) {
        files.push({
          type : "full",
          name : cur.name,
          text : docValue(cur)
        });
        cur.changed = null;
      }
    }

    return {
      query : query,
      files : files
    };
  }

});
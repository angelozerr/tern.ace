ace.define('ace/autocomplete/tern_completer', [ 'require', 'exports', 'module',
    'ace/ext/language_tools' ], function(require, exports, module) {

  var server = null;
  exports.setServer = function(s) {
    server = s;
  }

  var cls = "CodeMirror-Tern-";
  
  function typeToIcon(type) {
    var suffix;
    if (type == "?") suffix = "unknown";
    else if (type == "number" || type == "string" || type == "bool") suffix = type;
    else if (/^fn\(/.test(type)) suffix = "fn";
    else if (/^\[/.test(type)) suffix = "array";
    else suffix = "object";
    return cls + "completion " + cls + "completion-" + suffix;
  }
  
  exports.getCompletions = function(editor, session, pos, prefix, callback) {
    if (!server) {
      return;
    }
    server.request(editor, {type: "completions", types: true, docs: true, urls: true}, function(error, data) {
      if (error) return; // TODO showError(ts, cm, error);
      
      for (var i = 0; i < data.completions.length; ++i) {
        var completion = data.completions[i], className = typeToIcon(completion.type);
        if (data.guess) className += " " + cls + "guess";
        /*completions.push({text: completion.name + after,
                          displayText: completion.name,
                          className: className,
                          data: completion});*/
      }
      
      callback(null, data.completions.map(function(item) {
        return {
            name: item.name,
            value: item.name,
            score: 1,
            meta: "tern"
        };
    }));
      
    });
    /*
     * var wordScore = wordDistance(session, pos, prefix); var wordList =
     * Object.keys(wordScore); callback(null, wordList.map(function(word) {
     * return { name : word, value : word, score : wordScore[word], meta :
     * "local" }; }));
     */
  };

});

ace.define('tern/server', [ 'require', 'exports', 'module' ], function(require,
    exports, module) {

  var server = null, defs = [], plugins = {}, docs = Object.create(null);

  exports.addDef = function(def) {
    defs.push(def);
  }

  exports.request = function(cm, query, c, pos) {
    var server = getServer();
    var self = this;
    var doc = findDoc(cm);
    var request = buildRequest(doc, query, pos);
    
    server.request(request, function(error, data) {
      // TODO
      //if (!error && self.options.responseFilter)
      //  data = self.options.responseFilter(doc, query, request, error, data);
      c(error, data);
    });
  }
  
  function findDoc(doc, name) {
    for (var n in docs) {
      var cur = docs[n];
      if (cur.doc == doc) return cur;
    }
    if (!name) for (var i = 0;; ++i) {
      n = "[doc" + (i || "") + "]";
      if (!docs[n]) { name = n; break; }
    }
    return addDoc(name, doc);
  }

  function addDoc(name, doc) {
    var data = {doc: doc, name: name, changed: null};
    server.addFile(name, docValue(data));
    //TODO
    //CodeMirror.on(doc, "change", this.trackChange);
    return docs[name] = data;
  }
  
  function docValue(doc) {
    var val = doc.doc.getValue();
    //if (ts.options.fileFilter) val = ts.options.fileFilter(val, doc.name, doc.doc);
    return val;
  }

//Completion

  function hint(ts, cm, c) {
    ts.request(cm, {type: "completions", types: true, docs: true, urls: true}, function(error, data) {
      if (error) return showError(ts, cm, error);
      var completions = [], after = "";
      var from = data.start, to = data.end;
      if (cm.getRange(Pos(from.line, from.ch - 2), from) == "[\"" &&
          cm.getRange(to, Pos(to.line, to.ch + 2)) != "\"]")
        after = "\"]";

      for (var i = 0; i < data.completions.length; ++i) {
        var completion = data.completions[i], className = typeToIcon(completion.type);
        if (data.guess) className += " " + cls + "guess";
        completions.push({text: completion.name + after,
                          displayText: completion.name,
                          className: className,
                          data: completion});
      }

      var obj = {from: from, to: to, list: completions};
      var tooltip = null;
      CodeMirror.on(obj, "close", function() { remove(tooltip); });
      CodeMirror.on(obj, "update", function() { remove(tooltip); });
      CodeMirror.on(obj, "select", function(cur, node) {
        remove(tooltip);
        var content = ts.options.completionTip ? ts.options.completionTip(cur.data) : cur.data.doc;
        if (content) {
          tooltip = makeTooltip(node.parentNode.getBoundingClientRect().right + window.pageXOffset,
                                node.getBoundingClientRect().top + window.pageYOffset, content);
          tooltip.className += " " + cls + "hint-doc";
        }
      });
      c(obj);
    });
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
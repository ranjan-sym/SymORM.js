/**
 * The global singleton instance of the <b>SymORM</b> object. This library
 * maintains a in-memory database of all the records from different models with
 * relational hierarchy.
 *
 * <p>
 *   The library is initialized with <b>load()</b> method which accepts either a
 *   record object or an array of record object. The record object should have
 *   a property named <em>_type</em> which determines the type of the model
 *   represented by the record and an <em>id</em> property which determines the
 *   identity of the record.
 * </p>
 * <p>
 *   The library is updated at runtime with <b>update()</b>, <b>add()</b> and
 *   <b>remove()</b> methods available on the <b>SymORM</b>. The necessary
 *   changes on the database hierarchy is maintained and all the corresponding
 *   listeners are informed about the update.
 * </p>
 * <p>
 *   The application could use <b>listen()</b> method to register a callback
 *   to listen for any changes made on the database after it has been loaded.
 *   <br/><em>Note that the callback is called as soon as it is listened for
 *   initialization purpose</em>
 *
 * @type {SymORM}
 */
var SymORM = new function() {

  var database = { };

  this.listen = function(callback, model, id, field) {
    if (model === undefined) {
      return;
    }


    // Check if we are dealing with a valid model
    if (!database.hasOwnProperty(model)) {
      throw "Model '" + model + "' is not known";
    }

    // Create a new Listener object
    var listener = new Listener(callback);

    var modelObj = database[model];

    // Check if the the listening needs to be done on the entire model or just
    // a particular record or a field of the record
    if (id !== undefined) {
      if (!modelObj.items.hasOwnProperty(id)) {
        throw "Record '" + id + "' is not available in model '" + model + "'";
      }
      listener.source = modelObj.items[id];
      listener.field = field;
    } else {
      listener.source = modelObj;
    }

    // add the reference to the source for firing event later
    listener.source.listeners.push(listener);
    listener.fire();
    return listener;
  };

  this.load = function(repo) {
    // TODO The loading is done from the private function doLoad to provide an
    // opportunity to check and avoid for circular references that will
    // lead the loading to an infinite loop


    // we allow repo to be an array of objects as well
    if (repo instanceof Array) {
      repo.map(doLoad.bind(null, null));
    } else {
      doLoad(null, repo);
    }

    return database;
  };

  function doLoad(parent, repo) {
    // Get all the objects available in the repo and create a model structure
    var type = repo._type;
    var id = repo.id;

    var models;
    if (type instanceof Array) {
      // get the model, creating one if one doesn't exist
      models = type.map( function(c) {
        return database.hasOwnProperty(c) ? database[c] : (database[c] = new Model(c))
      });
    } else {
      models = [ database.hasOwnProperty(type) ? database[type] : (database[type] = new Model(type)) ];
    }

    // get the record, creating one if one doesn't exist
    var record = null;
    for(var i=0; i<models.length; ++i) {
      if (models[i].items.hasOwnProperty(id)) {
        record = models[i].items[id];
        break;
      }
    }
    if (record == null) {
      record = new Record();
    }

    // Update the parent field
    if (parent !== null && record.parents.indexOf(parent) == -1) {
      record.parents.push(parent);
    }

    // Let's make sure all the models point to the same record
    models.map( function(c) { return (c.items[id] = record) } );

    // Time to update the record
    for(var prop in repo) {
      // Ignore all properties that begin with '_'
      if (!repo.hasOwnProperty(prop) || prop.indexOf('_') == 0)
        continue;

      var value = repo[prop];
      if (value instanceof Array) {
        // A has many relationship, load the child models with their parent as current record
        record.state[prop] = value.map(doLoad.bind(null, record));
      } else if (value instanceof Object) {
        // A belongs to relationship, load the child model with its parent as current record
        record.state[prop] = doLoad(record, value);
      } else {
        // An ordinary attribute, just set it
        record.state[prop] = value;
      }
    }

    return record;
  }

  // A record is being updated
  this.update = function(raw) {
    var type = raw._type;
    if (!database.hasOwnProperty(type)) {
      console.log("Trying to update a record whose model '" + type + "' is not recognized");
      return false;
    }

    var model = database[type];
    var id = raw.id;
    if (!model.items.hasOwnProperty(id)) {
      console.log("Trying to update a record of model '" + type + "' with non-existent id '" + id + "'");
      return false;
    }

    doUpdate(model.items[id], raw);
  };

  /**
   * A method that updates the database with the new record and events on the
   * listeners.
   * @param record
   * @param raw
   * @return boolean {@code true} if there was an update otherwise {@code false}
   */
  function doUpdate(record, raw) {
    // Flag to find out if the model was actually changed or not
    var changed = false;

    for(var prop in raw) {
      if (!raw.hasOwnProperty(prop) || prop.indexOf('_') == 0) {
        continue;
      }

      if (raw[prop] instanceof Array) {
        // This is a tough one, need to check each and every record in both
        // the source and target, find out if we have any changes in the child
        // in which case throw the change event
        // we only see if any new child has been added, removal of a child
        // has to be dealt separately
        // we will ignore this, we are only interested in changes in the record
        // addition and removal are handled by onAddition and onRemoval
      } else if (raw[prop] instanceof Object) {
        // First make sure if we are talking about the same record or not
        if (! record.state.hasOwnProperty(prop) || record.state[prop].state.id != raw[prop].id) {
          // the object itself has changed, so we got to update with the new
          // record
          record.change(prop, getRecord(raw[prop]));
          changed = true;
        } else {
          if (doUpdate(record.state[prop], raw[prop])) {
            record.fire(prop);
            changed = true;
          }
        }
      } else {

        if ( (!record.state.hasOwnProperty(prop) && raw[prop] != null)
                || record.state[prop] != raw[prop]) {
          // If we didn't have this property before then we consider it changed
          // or if the value has actually changed
          record.change(prop, raw[prop]);
          changed = true;
        }
      }
    }

    if (changed) {
      // the model itself has changed
      record.fire();

      // Go through all the parents and tell them that since its child has
      // changed, it also has changed
      record.parents.map(function(r) { r.fire(); });
    }

    return changed;

  }

  function getRecord(raw) {
    var type = raw._type;
    var id = raw.id;
    if (!database.hasOwnProperty(type)) {
      return null;
    }

    var model = database[type];
    if (!model.items.hasOwnProperty(id)) {
      model.items[id] = new Record();

      model.fire();
    }

    doUpdate(model.items[id], raw);
    return model.items[id];
  }

  var Model = function(name) {
    this.name = name;
    this.items = {};
    this.listeners = [];

    this.fire = function() {
      this.listeners.map(function(l) { l.fire(); });
    }
  };

  var Record = function() {
    this.state = {};
    this.listeners = [];
    this.parents = [];

    this.change = function(field, newValue) {
      this.state[field] = newValue;
      // And then fire the specific field based event
      this.fire(field);
    };

    this.fire = function(field) {
      this.listeners.map(function(l) {
        if (l.field === field)
          l.fire();
      });
    };
  };


  var Listener = function(callback) {
    // Keep track of the callback
    this.callback = callback;
    this.source = null;
    this.field = null;

    /**
     * Cancel this listener
     */
    this.cancel = function() {
      var idx = this.source.listeners.indexOf(this);
      if (idx >= 0) {
        this.source.listeners.splice(idx, 1);
      }
    };

    this.fire = function() {
      this.callback(this.source, this.field);
    };
  };
};

var SymReactMixin = {
  listener: null,

  updateState: function(source, field) {
    if (source.hasOwnProperty('items')) {
      // Need to convert to an array here
      var items = [];
      for(var o in source.items) {
        items.push(source.items[o]);
      }
      this.setState({ items: items });
    } else if (field) {
      if (source.state[field] instanceof Array) {
        this.setState({items: source.state[field]});
      } else if (source.state[field] instanceof Object) {
        this.setState(source.state[field].state);
      } else {
        this.setState( { value: source.state[field]} );
      }
    } else {
      this.setState( source.state );
    }
  },

  componentWillMount: function() {
    if (this.listener) {
      this.listener.cancel();
    }

    // Check if we have the required properties
    if (this.props.hasOwnProperty('SymModel')) {
      var model = this.props.SymModel;

      if (this.props.hasOwnProperty('SymRecord')) {
        var id = this.props.SymRecord;
        if (this.props.hasOwnProperty('SymField')) {
          var field = this.props.SymField;
          this.listener = SymORM.listen(this.updateState, model, id, field);
        } else {
          this.listener = SymORM.listen(this.updateState, model, id);
        }
      } else {
        this.listener = SymORM.listen(this.updateState, model);
      }
    }
  },

  componentWillUnmount: function() {
    if (this.listener) {
      this.listener.cancel();
      this.listener = undefined;
    }
  }

};
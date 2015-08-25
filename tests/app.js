/**
 * Created by ranjan on 8/26/15.
 */
var Example = React.createClass({
  getInitialState:function() {
    return {
      name: 'Not updated yet'
    }
  },

  componentDidMount: function() {
    SymORM.registerReactComponent(this, new SymORM.Event('station', 101, 'name'));
  },

  componentWillUnmount: function() {
    SymORM.unregisterReactComponent(this);
  },

  render: function() {
    return <div>{this.state.name}</div>;
  }
});

React.render(<Example />, document.getElementById("container"));
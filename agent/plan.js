class Plan {
    constructor(parent) {
      this.#parent = parent;
    }
  
    // Define a stop function and other necessary logic
  }
  
  class GoPickUp extends Plan {
    static isApplicableTo(go_pick_up, x, y, id) {
      return go_pick_up === "go_pick_up";
    }
  
    async execute(go_pick_up, x, y, id) {
      // Plan execution logic for picking up a parcel
    }
  }
  
  class GoDeliver extends Plan {
    static isApplicableTo(go_deliver) {
      return go_deliver === "go_deliver";
    }
  
    async execute(go_deliver) {
      // Plan execution logic for delivering a parcel
    }
  }
  
  class Patrolling extends Plan {
    static isApplicableTo(patrolling) {
      return patrolling === "patrolling";
    }
  
    async execute(patrolling) {
      // Logic for random patrolling action
    }
  }
  
  export { GoPickUp, GoDeliver, Patrolling };
  